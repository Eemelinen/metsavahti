import { execFileSync } from 'node:child_process'
import { Client } from 'pg'

import { assertTestDatabaseUrl } from './db-guard'

/** Run Payload migrations against `databaseUrl` using the CLI (same path as prod/CI). */
export function runMigrations(databaseUrl: string): void {
  assertTestDatabaseUrl(databaseUrl)
  // On Windows `pnpm` is a `.cmd` shim that execFileSync cannot run (and that fails with
  // "The batch file cannot be found" through a shell); run pnpm's own entry through node,
  // as the harness CLI (@eemelinen/harness) does.
  const pnpmEntry = process.env.npm_execpath
  const [cmd, prefix]: [string, string[]] =
    process.platform === 'win32' && pnpmEntry ? [process.execPath, [pnpmEntry]] : ['pnpm', []]
  execFileSync(cmd, [...prefix, 'exec', 'payload', 'migrate'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_OPTIONS: '--no-deprecation' },
    stdio: 'inherit',
  })
}

/** TRUNCATE every table in `public` except Payload's migration bookkeeping. */
export async function truncateAll(databaseUrl: string): Promise<void> {
  assertTestDatabaseUrl(databaseUrl)
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename NOT IN ('payload_migrations', 'spatial_ref_sys')`,
    )
    if (rows.length === 0) return
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ')
    await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
  } finally {
    await client.end()
  }
}

/** What a spec may set on an inserted declaration; the rest stays as in the seed's. */
export type DeclarationSeed = {
  cuttingTypeCode?: number | null
  areaHa?: number
  /** ISO time; `valid_until` is three years later. Defaults to now. */
  receivedAt?: string
  /** Polygon WKT in EPSG:3067. Defaults to a 100 m square near Jyväskylä. */
  wkt?: string
}

const SEED_SQUARE_WKT =
  'POLYGON((435000 6900000, 435100 6900000, 435100 6900100, 435000 6900100, 435000 6900000))'

/**
 * Insert one declaration (by default a 100 m square near Jyväskylä, EPSG:3067) straight into
 * `databaseUrl` and return its id. The REST API refuses declaration writes (only the
 * pipeline creates them), so the e2e seed uses SQL for the alert it needs (MV-050 badge) and
 * the specs for the declarations of their own areas (MV-067).
 */
export async function insertDeclaration(
  databaseUrl: string,
  sourceId: string,
  seed: DeclarationSeed = {},
): Promise<number> {
  assertTestDatabaseUrl(databaseUrl)
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO declarations (
         source_id, declaration_number, cutting_type_code, area_ha, received_at, valid_until,
         raw_attributes, geom_hash, attr_hash, first_seen_at, last_seen_at, geom
       ) VALUES (
         $1::text, '1-2026-1', $2::int, $3::numeric, $4::timestamptz,
         $4::timestamptz + interval '3 years', '{}'::jsonb,
         'geom-' || $1::text, 'attr-' || $1::text, now(), now(),
         ST_Multi(ST_GeomFromText($5::text, 3067))
       ) RETURNING id`,
      [
        sourceId,
        seed.cuttingTypeCode === undefined ? 4 : seed.cuttingTypeCode,
        seed.areaHa ?? 1.5,
        seed.receivedAt ?? new Date().toISOString(),
        seed.wkt ?? SEED_SQUARE_WKT,
      ],
    )
    return Number(rows[0]!.id)
  } finally {
    await client.end()
  }
}
