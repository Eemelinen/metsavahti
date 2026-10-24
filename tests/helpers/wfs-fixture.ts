import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { DeclarationFeatureCollection, DeclarationGeometry } from '@/lib/wfs/schemas'

const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/wfs')

export function loadWfsFixture(
  name = 'forestusedeclaration.sample.json',
): DeclarationFeatureCollection {
  return JSON.parse(
    readFileSync(path.join(fixturesDir, name), 'utf8'),
  ) as DeclarationFeatureCollection
}

/** Bbox of the fixture in EPSG:3067 ([minE, minN, maxE, maxN]). */
export function fixtureBbox(fc: DeclarationFeatureCollection): [number, number, number, number] {
  let minE = Infinity
  let minN = Infinity
  let maxE = -Infinity
  let maxN = -Infinity
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      minE = Math.min(minE, c[0])
      maxE = Math.max(maxE, c[0])
      minN = Math.min(minN, c[1])
      maxN = Math.max(maxN, c[1])
      return
    }
    for (const child of c) visit(child)
  }
  for (const f of fc.features) visit(f.geometry.coordinates)
  return [minE, minN, maxE, maxN]
}

export function bboxesIntersect(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

function parseBboxValue(value: string): [number, number, number, number] | null {
  const parts = value.split(',').slice(0, 4).map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null
  return parts as [number, number, number, number]
}

/**
 * Bbox of a GetFeature request: the `BBOX(GEOMETRY,minx,miny,maxx,maxy,'EPSG:3067')` term of
 * `CQL_FILTER` the client sends (D-032), or a plain `bbox=minx,miny,maxx,maxy,EPSG:3067`.
 */
export function requestBbox(params: URLSearchParams): [number, number, number, number] | null {
  const cql = /BBOX\(\s*\w+\s*,([^)]*)\)/i.exec(params.get('CQL_FILTER') ?? '')
  if (cql) return parseBboxValue(cql[1]!)
  const bbox = params.get('bbox')
  return bbox ? parseBboxValue(bbox) : null
}

export type CircleRelation = 'inside' | 'borderline' | 'outside'

export type CircleFit = {
  relation: CircleRelation
  /** Metres between the stand and the circle edge it is classified against (≥ 0). */
  marginM: number
}

function distanceToSegment(
  [px, py]: [number, number],
  [ax, ay]: number[],
  [bx, by]: number[],
): number {
  const dx = bx! - ax!
  const dy = by! - ay!
  const lengthSq = dx * dx + dy * dy
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax!) * dx + (py - ay!) * dy) / lengthSq))
  return Math.hypot(px - (ax! + t * dx), py - (ay! + t * dy))
}

function ringContains([px, py]: [number, number], ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi! > py !== yj! > py && px < ((xj! - xi!) * (py - yi!)) / (yj! - yi!) + xi!) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Planar relation of a stand (EPSG:3067) to a watch circle: `inside` when the whole stand
 * lies in the circle, `outside` when it does not touch it, `borderline` when it crosses the
 * edge. The circle is convex, so a polygon is inside exactly when every outer vertex is.
 * `marginM` lets the fixture test require a clear answer: PostGIS buffers with a 32-gon,
 * which lies up to r·(1 − cos π/32) ≈ 0.5 % of r inside the true circle.
 */
export function fitToCircle(
  geometry: DeclarationGeometry,
  center: [number, number],
  radiusM: number,
): CircleFit {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let maxVertex = 0
  let minEdge = Infinity
  let centerCovered = false
  for (const [outer, ...holes] of polygons) {
    for (const vertex of outer!) {
      maxVertex = Math.max(maxVertex, Math.hypot(vertex[0]! - center[0], vertex[1]! - center[1]))
    }
    for (const ring of [outer!, ...holes]) {
      for (let i = 1; i < ring.length; i++) {
        minEdge = Math.min(minEdge, distanceToSegment(center, ring[i - 1]!, ring[i]!))
      }
    }
    if (ringContains(center, outer!) && !holes.some((hole) => ringContains(center, hole))) {
      centerCovered = true
    }
  }
  const minDistance = centerCovered ? 0 : minEdge
  if (maxVertex <= radiusM) return { relation: 'inside', marginM: radiusM - maxVertex }
  if (minDistance > radiusM) return { relation: 'outside', marginM: minDistance - radiusM }
  return {
    relation: 'borderline',
    marginM: Math.min(radiusM - minDistance, maxVertex - radiusM),
  }
}

/**
 * Behaves like the real WFS for a bbox query: returns the fixture features when
 * the requested bbox intersects the fixture, otherwise an empty collection.
 */
export function wfsResponseForBbox(
  fc: DeclarationFeatureCollection,
  bbox: [number, number, number, number] | null,
): DeclarationFeatureCollection {
  const hit = bbox ? bboxesIntersect(bbox, fixtureBbox(fc)) : true
  const features = hit ? fc.features : []
  return { ...fc, features, numberReturned: features.length }
}
