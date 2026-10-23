import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { DeclarationFeatureCollection } from '@/lib/wfs/schemas'

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

/** Parse the `bbox=minx,miny,maxx,maxy,EPSG:3067` WFS parameter. */
export function parseBboxParam(value: string | null): [number, number, number, number] | null {
  if (!value) return null
  const parts = value.split(',').slice(0, 4).map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null
  return parts as [number, number, number, number]
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
