/**
 * All PostGIS SQL lives here. Payload's field model does not know about the
 * geometry columns, so we talk to Drizzle directly via the Postgres adapter.
 */
import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { DeclarationGeometry } from '@/lib/wfs/schemas'

function drizzle(payload: Payload) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

/** Drizzle wraps driver errors; surface the Postgres message so failures are debuggable. */
async function run<T>(label: string, query: () => Promise<T>): Promise<T> {
  try {
    return await query()
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`${label}: ${message}`, { cause: err })
  }
}

/** Store a GeoJSON geometry (already in EPSG:3067) into `declarations.geom`. */
export async function setDeclarationGeometry(
  payload: Payload,
  declarationId: number,
  geometry: DeclarationGeometry,
): Promise<void> {
  await run('setDeclarationGeometry', () =>
    drizzle(payload).execute(sql`
      UPDATE declarations
      SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 3067))
      WHERE id = ${declarationId}
    `),
  )
}

export type WatchAreaMatch = {
  watchAreaId: number
  ownerId: number
  declarationId: number
  /** `watch_area_declarations.id` when the pair has been matched before, else null. */
  watchAreaDeclarationId: number | null
  geomHash: string
  attrHash: string
  lastSeenGeomHash: string | null
  lastSeenAttrHash: string | null
  distanceM: number
  cuttingTypeLabel: string | null
  areaHa: number | null
  receivedAt: string | null
}

/**
 * Intersecting (watch area, declaration) pairs whose `watch_area_declarations` row is
 * missing or stores hashes that differ from the declaration's current ones (`01 §3.4`).
 * Pairs that are already recorded with the current hashes are not returned, which is what
 * makes a re-run with identical data a no-op. `distanceM` is centre → polygon (0 inside).
 */
export async function findUnrecordedMatches(payload: Payload): Promise<WatchAreaMatch[]> {
  const { rows } = await run('findUnrecordedMatches', () =>
    drizzle(payload).execute<{
      watch_area_id: number
      owner_id: number
      declaration_id: number
      watch_area_declaration_id: number | null
      geom_hash: string
      attr_hash: string
      last_seen_geom_hash: string | null
      last_seen_attr_hash: string | null
      distance_m: string | number
      cutting_type_label: string | null
      area_ha: string | number | null
      received_at: string | Date | null
    }>(sql`
    SELECT
      wa.id                                             AS watch_area_id,
      wa.owner_id                                       AS owner_id,
      d.id                                              AS declaration_id,
      wad.id                                            AS watch_area_declaration_id,
      d.geom_hash                                       AS geom_hash,
      d.attr_hash                                       AS attr_hash,
      wad.last_seen_geom_hash                           AS last_seen_geom_hash,
      wad.last_seen_attr_hash                           AS last_seen_attr_hash,
      ST_Distance(ST_Transform(ST_SetSRID(wa.center, 4326), 3067), d.geom) AS distance_m,
      d.cutting_type_label                              AS cutting_type_label,
      d.area_ha                                         AS area_ha,
      d.received_at                                     AS received_at
    FROM watch_areas wa
    JOIN declarations d ON ST_Intersects(d.geom, wa.geom_3067)
    LEFT JOIN watch_area_declarations wad
      ON wad.watch_area_id = wa.id AND wad.declaration_id = d.id
    WHERE d.geom IS NOT NULL
      AND (
        wad.id IS NULL
        OR wad.last_seen_geom_hash <> d.geom_hash
        OR wad.last_seen_attr_hash <> d.attr_hash
      )
    ORDER BY wa.id, d.id
  `),
  )

  return rows.map((r) => ({
    watchAreaId: Number(r.watch_area_id),
    ownerId: Number(r.owner_id),
    declarationId: Number(r.declaration_id),
    watchAreaDeclarationId:
      r.watch_area_declaration_id == null ? null : Number(r.watch_area_declaration_id),
    geomHash: r.geom_hash,
    attrHash: r.attr_hash,
    lastSeenGeomHash: r.last_seen_geom_hash,
    lastSeenAttrHash: r.last_seen_attr_hash,
    distanceM: Number(r.distance_m),
    cuttingTypeLabel: r.cutting_type_label,
    areaHa: r.area_ha == null ? null : Number(r.area_ha),
    receivedAt: r.received_at == null ? null : new Date(r.received_at).toISOString(),
  }))
}

/** Declarations (as GeoJSON in WGS 84) intersecting a watch area — for the map. */
export async function findDeclarationsForWatchArea(
  payload: Payload,
  watchAreaId: number,
): Promise<Array<{ id: number; declarationNumber: string; geometry: DeclarationGeometry }>> {
  const { rows } = await run('findDeclarationsForWatchArea', () =>
    drizzle(payload).execute<{
      id: number
      declaration_number: string
      geojson: string
    }>(sql`
    SELECT d.id, d.declaration_number, ST_AsGeoJSON(ST_Transform(d.geom, 4326)) AS geojson
    FROM declarations d
    JOIN watch_areas wa ON ST_Intersects(d.geom, wa.geom_3067)
    WHERE wa.id = ${watchAreaId} AND d.geom IS NOT NULL
  `),
  )
  return rows.map((r) => ({
    id: Number(r.id),
    declarationNumber: r.declaration_number,
    geometry: JSON.parse(r.geojson) as DeclarationGeometry,
  }))
}

/** Used by health checks and tests. */
export async function postgisVersion(payload: Payload): Promise<string> {
  const { rows } = await run('postgisVersion', () =>
    drizzle(payload).execute<{ v: string }>(sql`SELECT PostGIS_Lib_Version() AS v`),
  )
  return rows[0]?.v ?? 'unknown'
}
