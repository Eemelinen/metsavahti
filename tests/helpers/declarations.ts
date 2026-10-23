import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** A 100 m × 100 m square near Jyväskylä in EPSG:3067; its centroid is (435050, 6900050). */
export const SQUARE_WKT_3067 =
  'POLYGON((435000 6900000, 435100 6900000, 435100 6900100, 435000 6900100, 435000 6900000))'

export type RawDeclarationInput = {
  sourceId: string
  declarationNumber?: string
  cuttingTypeCode?: number | null
  areaHa?: number | null
  receivedAt?: string
  geomHash?: string
  attrHash?: string
  rawAttributes?: Record<string, unknown>
  /** WKT in EPSG:3067; Polygon or MultiPolygon. */
  wkt?: string
}

/**
 * Inserts a declaration row with raw SQL, bypassing Payload entirely, the way a
 * bulk upsert (`01 §4.1`) would. Returns the new id. Constraint violations surface
 * with the Postgres message (it names the violated constraint).
 */
export async function insertDeclarationRaw(
  payload: Payload,
  input: RawDeclarationInput,
): Promise<number> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const receivedAt = input.receivedAt ?? '2026-01-15T10:00:00.000Z'
  const { rows } = await unwrapDriverError(() =>
    db.execute<{ id: number }>(sql`
    INSERT INTO declarations (
      source_id, declaration_number, cutting_type_code, area_ha, received_at, valid_until,
      raw_attributes, geom_hash, attr_hash, first_seen_at, last_seen_at, geom
    ) VALUES (
      ${input.sourceId},
      ${input.declarationNumber ?? '1-2026-1'},
      ${input.cuttingTypeCode ?? 4},
      ${input.areaHa ?? 1},
      ${receivedAt}::timestamptz,
      ${receivedAt}::timestamptz + interval '3 years',
      ${JSON.stringify(input.rawAttributes ?? {})}::jsonb,
      ${input.geomHash ?? 'geom-' + input.sourceId},
      ${input.attrHash ?? 'attr-' + input.sourceId},
      now(), now(),
      ST_Multi(ST_GeomFromText(${input.wkt ?? SQUARE_WKT_3067}, 3067))
    )
    RETURNING id
  `),
  )
  return Number(rows[0]!.id)
}

/** Drizzle wraps driver errors ("Failed query: …"); rethrow with the Postgres message. */
async function unwrapDriverError<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query()
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`insertDeclarationRaw: ${message}`, { cause: err })
  }
}
