import type { Feature, GeoJsonProperties, Geometry, Position } from 'geojson'
import proj4 from 'proj4'

/** ETRS89 / TM35FIN(E,N) — the CRS used by Metsäkeskus WFS and by all PostGIS columns. */
export const EPSG_3067 = 'EPSG:3067'
/** WGS 84 — what maps, browsers and Payload `point` fields use ([lon, lat]). */
export const EPSG_4326 = 'EPSG:4326'

/** The only two CRSs the application speaks. */
export type Crs = typeof EPSG_3067 | typeof EPSG_4326

// Registered once at module load; proj4 keeps a global registry.
proj4.defs(EPSG_3067, '+proj=utm +zone=35 +ellps=GRS80 +units=m +no_defs +type=crs')

/** [longitude, latitude] in WGS 84. */
export type LonLat = [number, number]
/** [easting, northing] in ETRS-TM35FIN metres. */
export type EastNorth = [number, number]

export function toWgs84([easting, northing]: EastNorth): LonLat {
  const [lon, lat] = proj4(EPSG_3067, EPSG_4326, [easting, northing])
  return [lon as number, lat as number]
}

export function to3067([lon, lat]: LonLat): EastNorth {
  const [e, n] = proj4(EPSG_4326, EPSG_3067, [lon, lat])
  return [e as number, n as number]
}

/** Rough sanity bounds of Finland in EPSG:3067, useful for validating input. */
export const FINLAND_BOUNDS_3067 = {
  minE: 50_000,
  minN: 6_600_000,
  maxE: 760_000,
  maxN: 7_800_000,
} as const

export function isInsideFinland([e, n]: EastNorth): boolean {
  const b = FINLAND_BOUNDS_3067
  return e >= b.minE && e <= b.maxE && n >= b.minN && n <= b.maxN
}

/** Reprojects the first two ordinates; any further ordinates (z, m) pass through untouched. */
function reprojectPosition(position: Position, from: Crs, to: Crs): Position {
  const [x, y, ...rest] = position
  if (x === undefined || y === undefined) {
    throw new Error(
      `GeoJSON position needs at least two ordinates, got ${JSON.stringify(position)}`,
    )
  }
  const [px, py] = proj4(from, to, [x, y])
  return [px as number, py as number, ...rest]
}

/**
 * Returns a new geometry with every coordinate reprojected from `from` to `to`.
 * A `bbox` member is dropped because it would no longer be valid; callers recompute it if needed.
 */
export function reprojectGeometry<G extends Geometry>(geometry: G, from: Crs, to: Crs): G {
  return reprojectAnyGeometry(geometry, from, to) as G
}

function reprojectAnyGeometry(geometry: Geometry, from: Crs, to: Crs): Geometry {
  const p = (position: Position): Position => reprojectPosition(position, from, to)
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: p(geometry.coordinates) }
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: geometry.coordinates.map(p) }
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(p) }
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates.map((line) => line.map(p)),
      }
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(p)) }
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(p))),
      }
    case 'GeometryCollection':
      return {
        type: 'GeometryCollection',
        geometries: geometry.geometries.map((g) => reprojectAnyGeometry(g, from, to)),
      }
    default: {
      const unknown: never = geometry
      throw new Error(`Unsupported GeoJSON geometry: ${JSON.stringify(unknown)}`)
    }
  }
}

/**
 * Returns a copy of `feature` whose geometry is reprojected from `from` to `to`.
 * `id` and `properties` are kept as-is; a stale `bbox` is dropped (see `reprojectGeometry`).
 */
export function reprojectFeature<G extends Geometry, P = GeoJsonProperties>(
  feature: Feature<G, P>,
  from: Crs,
  to: Crs,
): Feature<G, P> {
  const { bbox: _staleBbox, ...rest } = feature
  return { ...rest, geometry: reprojectGeometry(feature.geometry, from, to) }
}
