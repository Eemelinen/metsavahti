import type {
  GeometryCollection,
  LineString,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from 'geojson'
import { describe, expect, it } from 'vitest'

import { attrHash, canonicalizeGeometry, geomHash, stableStringify } from '@/lib/geo/hash'
import { loadWfsFixture } from '../../helpers/wfs-fixture'

/** A stand-shaped polygon in EPSG:3067 metres, with one hole. */
const outer: Position[] = [
  [385_600, 6_672_100],
  [385_700, 6_672_100],
  [385_720, 6_672_180],
  [385_650, 6_672_230],
  [385_600, 6_672_100],
]
const hole: Position[] = [
  [385_640, 6_672_140],
  [385_660, 6_672_140],
  [385_650, 6_672_160],
  [385_640, 6_672_140],
]
const polygon: Polygon = { type: 'Polygon', coordinates: [outer, hole] }

/** Same ring, started from another vertex (still closed). */
function rotate(ring: Position[], by: number): Position[] {
  const open = ring.slice(0, -1)
  const rotated = [...open.slice(by), ...open.slice(0, by)]
  return [...rotated, rotated[0] as Position]
}

function reverse(ring: Position[]): Position[] {
  return [...ring].reverse()
}

function movedBy(ring: Position[], index: number, dx: number, dy: number): Position[] {
  const copy = ring.map((p) => [...p])
  const target = copy[index] as number[]
  target[0] = (target[0] as number) + dx
  target[1] = (target[1] as number) + dy
  if (index === 0) copy[copy.length - 1] = [...target]
  return copy
}

const HEX_64 = /^[0-9a-f]{64}$/

describe('geomHash', () => {
  it('returns a sha256 hex digest and does not mutate its input', () => {
    const before = structuredClone(polygon)
    expect(geomHash(polygon)).toMatch(HEX_64)
    expect(polygon).toEqual(before)
  })

  it('is deterministic for the same geometry', () => {
    expect(geomHash(polygon)).toBe(geomHash(structuredClone(polygon)))
  })

  it('gives the same hash when the exterior ring starts at a different vertex', () => {
    for (const by of [1, 2, 3]) {
      const rotated: Polygon = { type: 'Polygon', coordinates: [rotate(outer, by), hole] }
      expect(geomHash(rotated)).toBe(geomHash(polygon))
    }
  })

  it('gives the same hash when a ring is wound the other way', () => {
    const reversed: Polygon = { type: 'Polygon', coordinates: [reverse(outer), reverse(hole)] }
    expect(geomHash(reversed)).toBe(geomHash(polygon))
    const rotatedAndReversed: Polygon = {
      type: 'Polygon',
      coordinates: [rotate(reverse(outer), 2), rotate(reverse(hole), 1)],
    }
    expect(geomHash(rotatedAndReversed)).toBe(geomHash(polygon))
  })

  it('gives the same hash when holes are listed in a different order', () => {
    const secondHole: Position[] = [
      [385_680, 6_672_120],
      [385_690, 6_672_120],
      [385_685, 6_672_130],
      [385_680, 6_672_120],
    ]
    const a: Polygon = { type: 'Polygon', coordinates: [outer, hole, secondHole] }
    const b: Polygon = { type: 'Polygon', coordinates: [outer, secondHole, hole] }
    expect(geomHash(a)).toBe(geomHash(b))
    expect(geomHash(a)).not.toBe(geomHash(polygon))
  })

  it('gives the same hash when multipolygon members are listed in a different order', () => {
    const second: Position[][] = [
      [
        [386_000, 6_672_000],
        [386_100, 6_672_000],
        [386_050, 6_672_080],
        [386_000, 6_672_000],
      ],
    ]
    const a: MultiPolygon = { type: 'MultiPolygon', coordinates: [[outer, hole], second] }
    const b: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [second, [rotate(outer, 2), reverse(hole)]],
    }
    expect(geomHash(a)).toBe(geomHash(b))
  })

  it('ignores sub-centimetre noise', () => {
    const jittered: Polygon = {
      type: 'Polygon',
      coordinates: [movedBy(outer, 1, 0.004, -0.004), hole],
    }
    expect(geomHash(jittered)).toBe(geomHash(polygon))
  })

  it('changes when a vertex moves by 2 cm', () => {
    const moved: Polygon = { type: 'Polygon', coordinates: [movedBy(outer, 1, 0.02, 0), hole] }
    expect(geomHash(moved)).not.toBe(geomHash(polygon))
    const movedNorth: Polygon = {
      type: 'Polygon',
      coordinates: [movedBy(outer, 2, 0, 0.02), hole],
    }
    expect(geomHash(movedNorth)).not.toBe(geomHash(polygon))
  })

  it('changes when a hole is removed', () => {
    const noHole: Polygon = { type: 'Polygon', coordinates: [outer] }
    expect(geomHash(noHole)).not.toBe(geomHash(polygon))
  })

  it('distinguishes a Polygon from a single-member MultiPolygon', () => {
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [polygon.coordinates] }
    expect(geomHash(multi)).not.toBe(geomHash(polygon))
  })

  it('normalises the direction of a LineString', () => {
    const line: LineString = {
      type: 'LineString',
      coordinates: [
        [385_600, 6_672_100],
        [385_700, 6_672_150],
        [385_800, 6_672_100],
      ],
    }
    const reversed: LineString = { type: 'LineString', coordinates: reverse(line.coordinates) }
    expect(geomHash(reversed)).toBe(geomHash(line))
  })

  it('orders the members of a GeometryCollection', () => {
    const point: Point = { type: 'Point', coordinates: [385_600, 6_672_100] }
    const a: GeometryCollection = { type: 'GeometryCollection', geometries: [polygon, point] }
    const b: GeometryCollection = { type: 'GeometryCollection', geometries: [point, polygon] }
    expect(geomHash(a)).toBe(geomHash(b))
  })

  it('hashes the recorded WFS fixture and detects a moved vertex', () => {
    const geometry = loadWfsFixture().features[0]!.geometry
    const hash = geomHash(geometry)
    expect(hash).toMatch(HEX_64)
    expect(geomHash(structuredClone(geometry))).toBe(hash)
    const moved = structuredClone(geometry)
    const ring = moved.coordinates[0] as number[][]
    ring[1]![0]! += 1
    expect(geomHash(moved)).not.toBe(hash)
  })
})

describe('canonicalizeGeometry', () => {
  it('rounds to centimetres, drops duplicate vertices and starts rings at the smallest vertex', () => {
    const noisy: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [385_720.004, 6_672_180],
          [385_650, 6_672_230.001],
          [385_600, 6_672_100],
          [385_600.003, 6_672_100.002], // rounds onto the previous vertex
          [385_700, 6_672_100],
          [385_720.004, 6_672_180],
        ],
      ],
    }
    expect(canonicalizeGeometry(noisy)).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [385_600, 6_672_100],
          [385_650, 6_672_230],
          [385_720, 6_672_180],
          [385_700, 6_672_100],
          [385_600, 6_672_100],
        ],
      ],
    })
  })

  it('folds negative zero into zero', () => {
    const point: Point = { type: 'Point', coordinates: [-0.001, 0.001] }
    const canonical = canonicalizeGeometry(point)
    expect(Object.is(canonical.coordinates[0], 0)).toBe(true)
    expect(Object.is(canonical.coordinates[1], 0)).toBe(true)
  })
})

describe('stableStringify and attrHash', () => {
  it('is independent of key order at every level', () => {
    const a = { b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' } }
    const b = { a: { c: 'x', d: [1, { y: 2, z: 1 }] }, b: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
    expect(stableStringify(a)).toBe('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}')
    expect(attrHash(a)).toBe(attrHash(b))
    expect(attrHash(a)).toMatch(HEX_64)
  })

  it('keeps array order significant', () => {
    expect(attrHash({ a: [1, 2] })).not.toBe(attrHash({ a: [2, 1] }))
  })

  it('changes when a value changes', () => {
    expect(attrHash({ AREA: 1.5, DECLARATIONSTATE: 'A' })).not.toBe(
      attrHash({ AREA: 1.6, DECLARATIONSTATE: 'A' }),
    )
  })

  it('follows JSON semantics for undefined, non-finite numbers and toJSON', () => {
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}')
    expect(stableStringify([undefined, NaN, Infinity])).toBe('[null,null,null]')
    expect(stableStringify({ at: new Date('2026-09-20T00:00:00.000Z') })).toBe(
      '{"at":"2026-09-20T00:00:00.000Z"}',
    )
    expect(attrHash({ a: undefined, b: 1 })).toBe(attrHash({ b: 1 }))
  })

  it('hashes the fixture properties identically regardless of key order', () => {
    const properties = loadWfsFixture().features[0]!.properties
    const shuffled = Object.fromEntries(Object.entries(properties).reverse())
    expect(attrHash(shuffled)).toBe(attrHash(properties))
  })
})
