import type { Feature, GeometryCollection, MultiPolygon, Point, Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'

import {
  EPSG_3067,
  EPSG_4326,
  type EastNorth,
  isInsideFinland,
  type LonLat,
  reprojectFeature,
  reprojectGeometry,
  to3067,
  toWgs84,
} from '@/lib/geo/crs'

/**
 * Control points (MV-020 acceptance). WGS 84 coordinates are the town centres; the
 * ETRS-TM35FIN references were computed with proj4 on 2026-09-06 and rounded to a
 * millimetre. They guard the projection definition (zone, ellipsoid, units) against
 * accidental changes; the round-trip assertions below are the accuracy requirement.
 */
const CONTROL_POINTS: ReadonlyArray<{ name: string; lonLat: LonLat; eastNorth: EastNorth }> = [
  { name: 'Helsinki', lonLat: [24.9384, 60.1699], eastNorth: [385_611.317, 6_672_118.38] },
  { name: 'Joensuu', lonLat: [29.7636, 62.601], eastNorth: [641_858.777, 6_944_173.334] },
  { name: 'Rovaniemi', lonLat: [25.7294, 66.5039], eastNorth: [443_475.103, 7_376_652.829] },
  { name: 'Vaasa', lonLat: [21.6158, 63.0951], eastNorth: [228_400.57, 7_007_576.949] },
  { name: 'Utsjoki', lonLat: [27.0282, 69.9086], eastNorth: [501_081.142, 7_755_680.748] },
]

const ONE_MILLIMETRE = 0.001

function distanceM(a: EastNorth, b: EastNorth): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

describe('crs: EPSG:3067 <-> WGS 84', () => {
  it.each(CONTROL_POINTS)(
    '$name: to3067 lands within 1 m of the reference',
    ({ lonLat, eastNorth }) => {
      expect(distanceM(to3067(lonLat), eastNorth)).toBeLessThan(1)
    },
  )

  it.each(CONTROL_POINTS)(
    '$name: 3067 → 4326 → 3067 round-trip error is below 1 mm',
    ({ eastNorth }) => {
      const roundTripped = to3067(toWgs84(eastNorth))
      expect(distanceM(roundTripped, eastNorth)).toBeLessThan(ONE_MILLIMETRE)
    },
  )

  it.each(CONTROL_POINTS)(
    '$name: 4326 → 3067 → 4326 round-trip stays within 1 mm',
    ({ lonLat }) => {
      const [lon, lat] = toWgs84(to3067(lonLat))
      // 5e-9° of latitude ≈ 0.55 mm; longitude degrees are shorter still at these latitudes.
      expect(lon).toBeCloseTo(lonLat[0], 8)
      expect(lat).toBeCloseTo(lonLat[1], 8)
    },
  )

  it('knows roughly where Finland is', () => {
    for (const { eastNorth } of CONTROL_POINTS) expect(isInsideFinland(eastNorth)).toBe(true)
    expect(isInsideFinland(to3067([2.35, 48.85]))).toBe(false) // Paris
  })
})

describe('crs: GeoJSON reprojection', () => {
  const helsinki = CONTROL_POINTS[0]!
  const square3067: Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [385_000, 6_672_000],
        [386_000, 6_672_000],
        [386_000, 6_673_000],
        [385_000, 6_673_000],
        [385_000, 6_672_000],
      ],
    ],
  }

  it('reprojectFeature converts a polygon, keeps id and properties and drops the stale bbox', () => {
    const feature: Feature<Polygon, { sourceId: string }> = {
      type: 'Feature',
      id: 'mki-1',
      bbox: [385_000, 6_672_000, 386_000, 6_673_000],
      properties: { sourceId: 'mki-1' },
      geometry: square3067,
    }

    const wgs84 = reprojectFeature(feature, EPSG_3067, EPSG_4326)
    expect(wgs84.id).toBe('mki-1')
    expect(wgs84.properties).toEqual({ sourceId: 'mki-1' })
    expect(wgs84).not.toHaveProperty('bbox')
    for (const [lon, lat] of wgs84.geometry.coordinates[0]!) {
      expect(lon).toBeGreaterThan(24.9)
      expect(lon).toBeLessThan(25.0)
      expect(lat).toBeGreaterThan(60.1)
      expect(lat).toBeLessThan(60.2)
    }

    const back = reprojectFeature(wgs84, EPSG_4326, EPSG_3067)
    const original = square3067.coordinates[0]!
    back.geometry.coordinates[0]!.forEach((position, i) => {
      expect(distanceM(position as EastNorth, original[i] as EastNorth)).toBeLessThan(
        ONE_MILLIMETRE,
      )
    })
  })

  it('does not mutate the input', () => {
    const before = structuredClone(square3067)
    reprojectGeometry(square3067, EPSG_3067, EPSG_4326)
    expect(square3067).toEqual(before)
  })

  it('handles Point and passes extra ordinates through', () => {
    const point: Point = { type: 'Point', coordinates: [...helsinki.eastNorth, 12.5] }
    const [lon, lat, z] = reprojectGeometry(point, EPSG_3067, EPSG_4326).coordinates
    expect(lon).toBeCloseTo(helsinki.lonLat[0], 4)
    expect(lat).toBeCloseTo(helsinki.lonLat[1], 4)
    expect(z).toBe(12.5)
  })

  it('handles MultiPolygon and GeometryCollection recursively', () => {
    const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [square3067.coordinates] }
    const collection: GeometryCollection = {
      type: 'GeometryCollection',
      geometries: [multi, { type: 'Point', coordinates: helsinki.eastNorth }],
    }

    const out = reprojectGeometry(collection, EPSG_3067, EPSG_4326)
    expect(out.geometries).toHaveLength(2)
    const [outMulti, outPoint] = out.geometries as [MultiPolygon, Point]
    expect(outMulti.type).toBe('MultiPolygon')
    expect(outMulti.coordinates[0]![0]).toHaveLength(5)
    expect(outPoint.coordinates[0]).toBeCloseTo(helsinki.lonLat[0], 4)
  })

  it('rejects a position with fewer than two ordinates', () => {
    const broken: Point = { type: 'Point', coordinates: [1] }
    expect(() => reprojectGeometry(broken, EPSG_3067, EPSG_4326)).toThrow(/at least two ordinates/)
  })
})
