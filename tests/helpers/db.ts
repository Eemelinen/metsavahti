import { execFileSync } from 'node:child_process'
import { Client } from 'pg'

import { assertTestDatabaseUrl } from './db-guard'

/** Run Payload migrations against `databaseUrl` using the CLI (same path as prod/CI). */
export function runMigrations(databaseUrl: string): void {
  assertTestDatabaseUrl(databaseUrl)
  execFileSync('pnpm', ['exec', 'payload', 'migrate'], {
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
