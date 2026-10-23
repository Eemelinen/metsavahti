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
