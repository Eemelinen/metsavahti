/**
 * All PostGIS SQL lives here. Payload's field model does not know about the
 * geometry columns, so we talk to Drizzle directly via the Postgres adapter.
 */
import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { Feature, FeatureCollection, MultiPolygon } from 'geojson'

import { wfs } from '@/config/wfs'
import type { Bbox } from '@/lib/geo/buffer'
import type { LonLat } from '@/lib/geo/crs'
import type { NormalisedDeclaration } from '@/lib/wfs/normalise'
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

export type UpsertDeclarationsResult = {
  /** Rows that did not exist before. */
  inserted: number
  /** Existing rows whose `geomHash` or `attrHash` changed; each wrote one revision. */
  updated: number
  /** Existing rows with identical hashes (only `lastSeenAt` moved). */
  unchanged: number
}

/**
 * Bulk upsert of normalised WFS features into `declarations` (`01 §3.3`, `§4.1` step 4),
 * one statement per `wfs.upsertBatchSize` rows. Every row in the batch counts as seen at
 * `now`: `lastSeenAt = now`, `missingRuns = 0`, `removedAt = null`. A row whose hashes
 * differ from the stored ones first copies the stored hashes and attributes into
 * `declaration_revisions`. Existing rows are always rewritten from the feature, so derived
 * columns (`cuttingTypeLabel`) follow the current code list; `firstSeenAt` never moves.
 * `sourceId`s repeated within `batch` are written once (the last occurrence wins).
 */
export async function upsertDeclarations(
  payload: Payload,
  batch: readonly NormalisedDeclaration[],
  now: Date = new Date(),
): Promise<UpsertDeclarationsResult> {
  const unique = [...new Map(batch.map((d) => [d.sourceId, d])).values()]
  const at = now.toISOString()
  const result: UpsertDeclarationsResult = { inserted: 0, updated: 0, unchanged: 0 }

  for (let i = 0; i < unique.length; i += wfs.upsertBatchSize) {
    const rows = unique.slice(i, i + wfs.upsertBatchSize).map((d) => ({
      source_id: d.sourceId,
      declaration_number: d.declarationNumber,
      cutting_type_code: d.cuttingTypeCode,
      cutting_type_label: d.cuttingTypeLabel,
      area_ha: d.areaHa,
      received_at: d.receivedAt,
      valid_until: d.validUntil,
      municipality_code: d.municipalityCode,
      raw_attributes: d.rawAttributes,
      geom_hash: d.geomHash,
      attr_hash: d.attrHash,
      geometry: d.geometry,
    }))
    const { rows: counts } = await run('upsertDeclarations', () =>
      drizzle(payload).execute<{
        inserted: string | number
        updated: string | number
        unchanged: string | number
      }>(sql`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS i(
          source_id text, declaration_number text, cutting_type_code numeric,
          cutting_type_label text, area_ha numeric, received_at timestamptz,
          valid_until timestamptz, municipality_code text, raw_attributes jsonb,
          geom_hash text, attr_hash text, geometry jsonb
        )
      ),
      prev AS (
        SELECT d.id, d.source_id, d.geom_hash, d.attr_hash, d.raw_attributes
        FROM declarations d
        JOIN input i ON i.source_id = d.source_id
      ),
      revisions AS (
        INSERT INTO declaration_revisions (
          declaration_id, prev_geom_hash, prev_attr_hash, prev_raw_attributes, changed_at,
          updated_at, created_at
        )
        SELECT p.id, p.geom_hash, p.attr_hash, p.raw_attributes, ${at}::timestamptz, ${at}::timestamptz, ${at}::timestamptz
        FROM prev p
        JOIN input i ON i.source_id = p.source_id
        WHERE p.geom_hash <> i.geom_hash OR p.attr_hash <> i.attr_hash
        RETURNING declaration_id
      ),
      upserted AS (
        INSERT INTO declarations (
          source_id, declaration_number, cutting_type_code, cutting_type_label, area_ha,
          received_at, valid_until, municipality_code, raw_attributes, geom_hash, attr_hash,
          first_seen_at, last_seen_at, missing_runs, removed_at, geom, updated_at, created_at
        )
        SELECT
          i.source_id, i.declaration_number, i.cutting_type_code, i.cutting_type_label,
          i.area_ha, i.received_at, i.valid_until, i.municipality_code, i.raw_attributes,
          i.geom_hash, i.attr_hash, ${at}::timestamptz, ${at}::timestamptz, 0, NULL::timestamptz,
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(i.geometry::text), 3067)), ${at}::timestamptz, ${at}::timestamptz
        FROM input i
        ON CONFLICT (source_id) DO UPDATE SET
          declaration_number = EXCLUDED.declaration_number,
          cutting_type_code  = EXCLUDED.cutting_type_code,
          cutting_type_label = EXCLUDED.cutting_type_label,
          area_ha            = EXCLUDED.area_ha,
          received_at        = EXCLUDED.received_at,
          valid_until        = EXCLUDED.valid_until,
          municipality_code  = EXCLUDED.municipality_code,
          raw_attributes     = EXCLUDED.raw_attributes,
          geom_hash          = EXCLUDED.geom_hash,
          attr_hash          = EXCLUDED.attr_hash,
          geom               = EXCLUDED.geom,
          last_seen_at       = EXCLUDED.last_seen_at,
          missing_runs       = 0,
          removed_at         = NULL,
          updated_at         = EXCLUDED.updated_at
        RETURNING source_id, geom_hash, attr_hash
      )
      SELECT
        count(*) FILTER (WHERE p.id IS NULL) AS inserted,
        (SELECT count(*) FROM revisions)     AS updated,
        count(*) FILTER (
          WHERE p.geom_hash = u.geom_hash AND p.attr_hash = u.attr_hash
        )                                    AS unchanged
      FROM upserted u
      LEFT JOIN prev p ON p.source_id = u.source_id
    `),
    )
    const c = counts[0]
    result.inserted += Number(c?.inserted ?? 0)
    result.updated += Number(c?.updated ?? 0)
    result.unchanged += Number(c?.unchanged ?? 0)
  }
  return result
}

export type MarkMissingResult = {
  /** Rows whose `missingRuns` went up. */
  missed: number
  /** Of those, rows that reached `wfs.missingRunsBeforeRemoval` and got `removedAt = now`. */
  removed: number
}

/**
 * After one bbox has been fetched completely: every stored declaration that intersects
 * `bbox` (EPSG:3067), is not removed and is not in `seenSourceIds` gets `missingRuns += 1`,
 * and `removedAt = now` once it reaches `wfs.missingRunsBeforeRemoval` (`01 §4.1` step 5).
 * `upsertDeclarations()` resets the counter of every row it sees, which makes the misses
 * consecutive. `now` is the run's timestamp: a row already seen or counted at or after it
 * (through another, overlapping bbox of the same run) is skipped, so a run counts each
 * declaration at most once. Call it only for a bbox whose every page arrived.
 */
export async function markMissing(
  payload: Payload,
  bbox: Bbox,
  seenSourceIds: readonly string[],
  now: Date = new Date(),
): Promise<MarkMissingResult> {
  const at = now.toISOString()
  const [minE, minN, maxE, maxN] = bbox
  const { rows } = await run('markMissing', () =>
    drizzle(payload).execute<{ missed: string | number; removed: string | number }>(sql`
    WITH missed AS (
      UPDATE declarations d
      SET missing_runs = COALESCE(d.missing_runs, 0) + 1,
          removed_at = CASE
            WHEN COALESCE(d.missing_runs, 0) + 1 >= ${wfs.missingRunsBeforeRemoval} THEN ${at}::timestamptz
          END,
          updated_at = ${at}::timestamptz
      WHERE d.removed_at IS NULL
        AND d.last_seen_at < ${at}::timestamptz
        AND d.updated_at < ${at}::timestamptz
        AND ST_Intersects(d.geom, ST_MakeEnvelope(${minE}, ${minN}, ${maxE}, ${maxN}, 3067))
        AND d.source_id NOT IN (
          SELECT jsonb_array_elements_text(${JSON.stringify(seenSourceIds)}::jsonb)
        )
      RETURNING d.removed_at
    )
    SELECT count(*) AS missed, count(removed_at) AS removed FROM missed
  `),
  )
  return { missed: Number(rows[0]?.missed ?? 0), removed: Number(rows[0]?.removed ?? 0) }
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

export type MatchedDeclaration = {
  watchAreaDeclarationId: number
  watchAreaId: number
  ownerId: number
  declarationId: number
  /** True when the pair was recorded by this run. */
  inserted: boolean
  /** The declaration's current hashes. */
  geomHash: string
  attrHash: string
  /** Hashes stored on the join row before this run; equal to the current ones when inserted. */
  lastSeenGeomHash: string
  lastSeenAttrHash: string
  distanceM: number
  cuttingTypeLabel: string | null
  areaHa: number | null
  receivedAt: string | null
}

/**
 * The matching statement of `01 §4.2`: records every intersecting (watch area, declaration)
 * pair in `watch_area_declarations` and returns the rows that need an alert, i.e. pairs
 * inserted now and pairs whose stored hashes differ from the declaration's current ones.
 * Only declarations that are not removed and still valid at `now` match. An existing pair
 * gets `lastMatchedAt = now` and a fresh `distanceM` (the centre or the polygon may have
 * moved) but keeps its stored hashes: the caller creates the alerts, then stores the new
 * hashes. Re-running with unchanged data inserts nothing and returns nothing.
 * `distanceM` is centre → polygon in metres, 0 when the polygon covers the centre.
 */
export async function matchWatchAreas(
  payload: Payload,
  now: Date = new Date(),
): Promise<MatchedDeclaration[]> {
  const at = now.toISOString()
  const { rows } = await run('matchWatchAreas', () =>
    drizzle(payload).execute<{
      watch_area_declaration_id: number
      watch_area_id: number
      owner_id: number
      declaration_id: number
      inserted: boolean
      geom_hash: string
      attr_hash: string
      last_seen_geom_hash: string
      last_seen_attr_hash: string
      distance_m: string | number
      cutting_type_label: string | null
      area_ha: string | number | null
      received_at: string | Date | null
    }>(sql`
    WITH candidates AS (
      SELECT
        wa.id AS watch_area_id,
        d.id  AS declaration_id,
        d.geom_hash,
        d.attr_hash,
        ST_Distance(ST_Transform(ST_SetSRID(wa.center, 4326), 3067), d.geom) AS distance_m
      FROM watch_areas wa
      JOIN declarations d ON ST_Intersects(wa.geom_3067, d.geom)
      WHERE d.removed_at IS NULL AND d.valid_until > ${at}::timestamptz
    ),
    upserted AS (
      INSERT INTO watch_area_declarations (
        watch_area_id, declaration_id, first_matched_at, last_matched_at,
        last_seen_geom_hash, last_seen_attr_hash, distance_m, updated_at, created_at
      )
      SELECT watch_area_id, declaration_id, ${at}::timestamptz, ${at}::timestamptz, geom_hash, attr_hash, distance_m,
             ${at}::timestamptz, ${at}::timestamptz
      FROM candidates
      ON CONFLICT (watch_area_id, declaration_id) DO UPDATE SET
        last_matched_at = EXCLUDED.last_matched_at,
        distance_m      = EXCLUDED.distance_m,
        updated_at      = EXCLUDED.updated_at
      RETURNING id, watch_area_id, declaration_id, last_seen_geom_hash, last_seen_attr_hash,
                (xmax = 0) AS inserted
    )
    SELECT
      u.id                  AS watch_area_declaration_id,
      u.watch_area_id       AS watch_area_id,
      wa.owner_id           AS owner_id,
      u.declaration_id      AS declaration_id,
      u.inserted            AS inserted,
      c.geom_hash           AS geom_hash,
      c.attr_hash           AS attr_hash,
      u.last_seen_geom_hash AS last_seen_geom_hash,
      u.last_seen_attr_hash AS last_seen_attr_hash,
      c.distance_m          AS distance_m,
      d.cutting_type_label  AS cutting_type_label,
      d.area_ha             AS area_ha,
      d.received_at         AS received_at
    FROM upserted u
    JOIN candidates c
      ON c.watch_area_id = u.watch_area_id AND c.declaration_id = u.declaration_id
    JOIN watch_areas wa ON wa.id = u.watch_area_id
    JOIN declarations d ON d.id = u.declaration_id
    WHERE u.inserted
       OR u.last_seen_geom_hash <> c.geom_hash
       OR u.last_seen_attr_hash <> c.attr_hash
    ORDER BY u.watch_area_id, u.declaration_id
  `),
  )

  return rows.map((r) => ({
    watchAreaDeclarationId: Number(r.watch_area_declaration_id),
    watchAreaId: Number(r.watch_area_id),
    ownerId: Number(r.owner_id),
    declarationId: Number(r.declaration_id),
    inserted: Boolean(r.inserted),
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

export type DeclarationMapProperties = {
  sourceId: string
  declarationNumber: string
  cuttingTypeCode: number | null
  cuttingTypeLabel: string | null
  areaHa: number | null
  receivedAt: string | null
  validUntil: string | null
  /** Watch-area centre → polygon in metres, 0 when the polygon covers the centre. */
  distanceM: number
}

/** Coordinate decimals of the map GeoJSON: 1e-6° is ~0.1 m. */
const MAP_GEOJSON_DECIMALS = 6

/** A `declarations` row as the map queries select it (`toMapFeature()` turns it into a feature). */
type DeclarationMapRow = {
  id: number
  source_id: string
  declaration_number: string
  cutting_type_code: string | number | null
  cutting_type_label: string | null
  area_ha: string | number | null
  received_at: string | Date | null
  valid_until: string | Date | null
  distance_m: string | number
  geojson: string
}

function toMapFeature(r: DeclarationMapRow): Feature<MultiPolygon, DeclarationMapProperties> {
  const iso = (v: string | Date | null) => (v == null ? null : new Date(v).toISOString())
  return {
    type: 'Feature',
    id: Number(r.id),
    geometry: JSON.parse(r.geojson) as MultiPolygon,
    properties: {
      sourceId: r.source_id,
      declarationNumber: r.declaration_number,
      cuttingTypeCode: r.cutting_type_code == null ? null : Number(r.cutting_type_code),
      cuttingTypeLabel: r.cutting_type_label,
      areaHa: r.area_ha == null ? null : Number(r.area_ha),
      receivedAt: iso(r.received_at),
      validUntil: iso(r.valid_until),
      distanceM: Number(r.distance_m),
    },
  }
}

/**
 * The declarations a watch area's map shows, as a GeoJSON FeatureCollection in WGS 84:
 * every declaration intersecting the area that is not removed and still valid at `now`,
 * newest first. Feature `id` is the declaration id. Does not check ownership; the caller
 * must (`assertOwner()`, D-020).
 */
export async function declarationsForWatchArea(
  payload: Payload,
  watchAreaId: number,
  now: Date = new Date(),
): Promise<FeatureCollection<MultiPolygon, DeclarationMapProperties>> {
  const { rows } = await run('declarationsForWatchArea', () =>
    drizzle(payload).execute<DeclarationMapRow>(sql`
    SELECT
      d.id, d.source_id, d.declaration_number, d.cutting_type_code, d.cutting_type_label,
      d.area_ha, d.received_at, d.valid_until,
      ST_Distance(ST_Transform(ST_SetSRID(wa.center, 4326), 3067), d.geom) AS distance_m,
      ST_AsGeoJSON(ST_Transform(d.geom, 4326), ${MAP_GEOJSON_DECIMALS}::int) AS geojson
    FROM watch_areas wa
    JOIN declarations d ON ST_Intersects(d.geom, wa.geom_3067)
    WHERE wa.id = ${watchAreaId}
      AND d.removed_at IS NULL
      AND d.valid_until > ${now.toISOString()}::timestamptz
    ORDER BY d.received_at DESC NULLS LAST, d.id
  `),
  )
  return { type: 'FeatureCollection', features: rows.map(toMapFeature) }
}

/**
 * How many stored declarations a not-yet-saved watch area would match (`01 §6` preview):
 * the same circle as `watch_areas.geom_3067` (D-003) and the same "not removed, valid at
 * `now`" rule as `matchWatchAreas()`. Reads the local cache only.
 */
export async function previewCount(
  payload: Payload,
  center: LonLat,
  radiusM: number,
  now: Date = new Date(),
): Promise<number> {
  const { rows } = await run('previewCount', () =>
    drizzle(payload).execute<{ n: string | number }>(sql`
    SELECT count(*) AS n
    FROM declarations d
    WHERE d.removed_at IS NULL
      AND d.valid_until > ${now.toISOString()}::timestamptz
      AND ST_Intersects(d.geom, ST_Buffer(${point3067(center)}, ${radiusM}::double precision))
  `),
  )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Per watch area, how many declarations its map shows now (`/vahtialueet` "N voimassa"): the
 * same "intersects `geom_3067`, not removed, valid at `now`" rule as
 * `declarationsForWatchArea()`. Every id in `watchAreaIds` gets an entry, 0 when nothing
 * intersects. Does not check ownership; the caller passes only the account's own ids.
 */
export async function activeDeclarationCounts(
  payload: Payload,
  watchAreaIds: readonly number[],
  now: Date = new Date(),
): Promise<Map<number, number>> {
  const counts = new Map(watchAreaIds.map((id) => [id, 0]))
  if (watchAreaIds.length === 0) return counts
  const { rows } = await run('activeDeclarationCounts', () =>
    drizzle(payload).execute<{ id: number; n: string | number }>(sql`
    SELECT wa.id, count(*) AS n
    FROM watch_areas wa
    JOIN declarations d ON ST_Intersects(d.geom, wa.geom_3067)
    WHERE wa.id IN (SELECT jsonb_array_elements_text(${JSON.stringify(watchAreaIds)}::jsonb)::int)
      AND d.removed_at IS NULL
      AND d.valid_until > ${now.toISOString()}::timestamptz
    GROUP BY wa.id
  `),
  )
  for (const r of rows) counts.set(Number(r.id), Number(r.n))
  return counts
}

/** A WGS 84 point as an EPSG:3067 geometry expression. */
function point3067([lng, lat]: LonLat) {
  return sql`ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 3067)`
}

/**
 * The declarations `previewCount()` counts, as the map GeoJSON of `declarationsForWatchArea()`
 * (WGS 84, newest first, `distanceM` from `center`), for the preview endpoint (MV-063).
 */
export async function previewDeclarations(
  payload: Payload,
  center: LonLat,
  radiusM: number,
  now: Date = new Date(),
): Promise<FeatureCollection<MultiPolygon, DeclarationMapProperties>> {
  const { rows } = await run('previewDeclarations', () =>
    drizzle(payload).execute<DeclarationMapRow>(sql`
    SELECT
      d.id, d.source_id, d.declaration_number, d.cutting_type_code, d.cutting_type_label,
      d.area_ha, d.received_at, d.valid_until,
      ST_Distance(${point3067(center)}, d.geom) AS distance_m,
      ST_AsGeoJSON(ST_Transform(d.geom, 4326), ${MAP_GEOJSON_DECIMALS}::int) AS geojson
    FROM declarations d
    WHERE d.removed_at IS NULL
      AND d.valid_until > ${now.toISOString()}::timestamptz
      AND ST_Intersects(d.geom, ST_Buffer(${point3067(center)}, ${radiusM}::double precision))
    ORDER BY d.received_at DESC NULLS LAST, d.id
  `),
  )
  return { type: 'FeatureCollection', features: rows.map(toMapFeature) }
}

/**
 * Whether the boxes in `wfs_bbox_fetches` (EPSG:3067) together cover `bbox`, i.e. the preview
 * endpoint has fetched every declaration that can touch it from the WFS before (MV-063).
 */
export async function isBboxFetched(payload: Payload, bbox: Bbox): Promise<boolean> {
  const [minE, minN, maxE, maxN] = bbox
  const { rows } = await run('isBboxFetched', () =>
    drizzle(payload).execute<{ covered: boolean | null }>(sql`
    WITH wanted AS (SELECT ST_MakeEnvelope(${minE}, ${minN}, ${maxE}, ${maxN}, 3067) AS box)
    SELECT ST_Covers(ST_Union(ST_MakeEnvelope(f.min_e, f.min_n, f.max_e, f.max_n, 3067)), w.box) AS covered
    FROM wanted w
    JOIN wfs_bbox_fetches f
      ON f.min_e < ${maxE} AND f.max_e > ${minE} AND f.min_n < ${maxN} AND f.max_n > ${minN}
    GROUP BY w.box
  `),
  )
  return rows[0]?.covered === true
}

/** Record that every page of `bbox` (EPSG:3067) arrived from the WFS at `now` (MV-063). */
export async function recordBboxFetch(
  payload: Payload,
  bbox: Bbox,
  featureCount: number,
  now: Date = new Date(),
): Promise<void> {
  const [minE, minN, maxE, maxN] = bbox
  const at = now.toISOString()
  await run('recordBboxFetch', () =>
    drizzle(payload).execute(sql`
    INSERT INTO wfs_bbox_fetches (min_e, min_n, max_e, max_n, feature_count, fetched_at, updated_at, created_at)
    VALUES (${minE}, ${minN}, ${maxE}, ${maxN}, ${featureCount}, ${at}::timestamptz, ${at}::timestamptz, ${at}::timestamptz)
  `),
  )
}

export type AlertMapGeometry = {
  ownerId: number
  /** Watch-area centre in EPSG:3067. */
  center: [number, number]
  radiusM: number
  /** The declaration's polygon in EPSG:3067; null when the row or its geometry is gone. */
  declaration: DeclarationGeometry | null
  cuttingTypeCode: number | null
}

/** What the static map image of an alert draws (MV-077), all in EPSG:3067; null = no alert. */
export async function findAlertMapGeometry(
  payload: Payload,
  alertId: number,
): Promise<AlertMapGeometry | null> {
  const { rows } = await run('findAlertMapGeometry', () =>
    drizzle(payload).execute<{
      owner_id: number
      center_e: string | number
      center_n: string | number
      radius_m: string | number
      geojson: string | null
      cutting_type_code: number | null
    }>(sql`
    SELECT
      a.user_id                                                 AS owner_id,
      ST_X(ST_Transform(ST_SetSRID(wa.center, 4326), 3067))     AS center_e,
      ST_Y(ST_Transform(ST_SetSRID(wa.center, 4326), 3067))     AS center_n,
      wa.radius_m                                               AS radius_m,
      ST_AsGeoJSON(d.geom)                                      AS geojson,
      d.cutting_type_code                                       AS cutting_type_code
    FROM alerts a
    JOIN watch_areas wa ON wa.id = a.watch_area_id
    LEFT JOIN declarations d ON d.id = a.declaration_id
    WHERE a.id = ${alertId}
  `),
  )
  const r = rows[0]
  if (!r) return null
  return {
    ownerId: Number(r.owner_id),
    center: [Number(r.center_e), Number(r.center_n)],
    radiusM: Number(r.radius_m),
    declaration: r.geojson == null ? null : (JSON.parse(r.geojson) as DeclarationGeometry),
    cuttingTypeCode: r.cutting_type_code == null ? null : Number(r.cutting_type_code),
  }
}

/** Used by health checks and tests. */
export async function postgisVersion(payload: Payload): Promise<string> {
  const { rows } = await run('postgisVersion', () =>
    drizzle(payload).execute<{ v: string }>(sql`SELECT PostGIS_Lib_Version() AS v`),
  )
  return rows[0]?.v ?? 'unknown'
}
