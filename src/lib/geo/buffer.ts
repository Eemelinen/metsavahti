import { bbox as turfBbox, buffer as turfBuffer, point as turfPoint } from '@turf/turf'
import type { Feature, Polygon } from 'geojson'

import { type EastNorth, type LonLat, to3067 } from '@/lib/geo/crs'

/** [minX, minY, maxX, maxY] */
export type Bbox = [number, number, number, number]

/** Vertices on the preview ring; 64 keeps the polygon area within 0.02 % of πr². */
const PREVIEW_STEPS = 64

function assertLonLat(center: LonLat): void {
  const [lon, lat] = center
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError(`center longitude must be a finite number in [-180, 180], got ${lon}`)
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`center latitude must be a finite number in [-90, 90], got ${lat}`)
  }
}

function assertRadius(radiusM: number): void {
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new RangeError(`radiusM must be a finite number > 0, got ${radiusM}`)
  }
}

/**
 * Circle-ish polygon (WGS 84) of radius `radiusM` metres around `center4326`, for drawing a
 * watch area on the map (MV-027). Built with turf's geodesic buffer, so it is a
 * `PREVIEW_STEPS`-gon whose area is within 1 % of πr² anywhere in Finland.
 *
 * Preview only: the authoritative watch-area geometry is the PostGIS `geom_3067` column
 * (`ST_Buffer` in EPSG:3067); never persist or match against this polygon.
 */
export function previewCircle(center4326: LonLat, radiusM: number): Feature<Polygon> {
  assertLonLat(center4326)
  assertRadius(radiusM)
  const polygon = turfBuffer(turfPoint(center4326), radiusM, {
    units: 'meters',
    steps: PREVIEW_STEPS,
  })
  if (!polygon) throw new Error('Failed to buffer point')
  return polygon as Feature<Polygon>
}

/** Bounding box of the watch-area preview in WGS 84. */
export function watchAreaBbox4326(center: LonLat, radiusM: number): Bbox {
  return turfBbox(previewCircle(center, radiusM)) as Bbox
}

/**
 * Axis-aligned bounding box in EPSG:3067 metres — what we send to the WFS `bbox` parameter.
 * Computed directly in the projected CRS, so it is exact.
 */
export function watchAreaBbox3067(center: LonLat, radiusM: number): Bbox {
  const [e, n]: EastNorth = to3067(center)
  return [e - radiusM, n - radiusM, e + radiusM, n + radiusM]
}

export function formatBbox(bbox: Bbox): string {
  return bbox.map((v) => v.toFixed(2)).join(',')
}
