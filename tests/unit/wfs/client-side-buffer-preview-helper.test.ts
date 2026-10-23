import { area, booleanPointInPolygon, distance, point } from '@turf/turf'
import { describe, expect, it } from 'vitest'

import { previewCircle } from '@/lib/geo/buffer'
import type { LonLat } from '@/lib/geo/crs'

const helsinki: LonLat = [24.94, 60.17]
const jyvaskyla: LonLat = [25.75, 62.24]
const utsjoki: LonLat = [27.03, 69.91]

const centres: [string, LonLat][] = [
  ['Helsinki', helsinki],
  ['Jyväskylä', jyvaskyla],
  ['Utsjoki', utsjoki],
]
const radii = [100, 1_000, 10_000, 50_000]

describe('previewCircle', () => {
  it.each(centres)('area is within 1 % of πr² around %s for every radius', (_name, centre) => {
    for (const r of radii) {
      const expected = Math.PI * r * r
      const relativeError = Math.abs(area(previewCircle(centre, r)) - expected) / expected
      expect(relativeError, `r=${r}`).toBeLessThan(0.01)
    }
  })

  it('returns a closed single-ring GeoJSON Polygon feature', () => {
    const feature = previewCircle(helsinki, 1_000)
    expect(feature.type).toBe('Feature')
    expect(feature.geometry.type).toBe('Polygon')
    expect(feature.geometry.coordinates).toHaveLength(1)
    const ring = feature.geometry.coordinates[0]!
    expect(ring.length).toBeGreaterThanOrEqual(33)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('contains the centre and keeps every vertex about radius metres away from it', () => {
    const r = 2_500
    const feature = previewCircle(jyvaskyla, r)
    expect(booleanPointInPolygon(point(jyvaskyla), feature)).toBe(true)
    for (const vertex of feature.geometry.coordinates[0]!) {
      const d = distance(point(jyvaskyla), point(vertex), { units: 'meters' })
      expect(Math.abs(d - r) / r).toBeLessThan(0.005)
    }
  })

  it('rejects a non-positive or non-finite radius', () => {
    expect(() => previewCircle(helsinki, 0)).toThrow(RangeError)
    expect(() => previewCircle(helsinki, -10)).toThrow(RangeError)
    expect(() => previewCircle(helsinki, Number.NaN)).toThrow(RangeError)
    expect(() => previewCircle(helsinki, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('rejects a centre outside WGS 84 bounds', () => {
    expect(() => previewCircle([181, 60], 100)).toThrow(RangeError)
    expect(() => previewCircle([25, 91], 100)).toThrow(RangeError)
    expect(() => previewCircle([Number.NaN, 60], 100)).toThrow(RangeError)
  })
})
