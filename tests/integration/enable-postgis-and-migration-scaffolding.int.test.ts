import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { describe, expect, it } from 'vitest'

import { migrations } from '@/payload/migrations'
import { getTestPayload } from '../helpers/payload'

/**
 * MV-030: PostGIS is enabled before the first geometry column exists — by the adapter's
 * `extensions` option ahead of every `migrate` and by the first statement of the initial
 * migration — and the committed migration list is the schema history that actually ran.
 */
describe('PostGIS extension and migration scaffolding', () => {
  it('answers SELECT PostGIS_Version()', async () => {
    const payload = await getTestPayload()
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    const { rows } = await db.execute<{ v: string }>(sql`SELECT PostGIS_Version() AS v`)
    expect(rows[0]?.v).toMatch(/^3\.\d+/)

    const { rows: ext } = await db.execute<{ extname: string }>(
      sql`SELECT extname FROM pg_extension WHERE extname = 'postgis'`,
    )
    expect(ext).toEqual([{ extname: 'postgis' }])
  })

  it('enables postgis through the adapter before migrations run', async () => {
    const payload = await getTestPayload()
    expect((payload.db as unknown as PostgresAdapter).extensions).toEqual({ postgis: true })
  })

  it('applied exactly the committed migrations, in index order', async () => {
    const payload = await getTestPayload()
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    const { rows } = await db.execute<{ name: string }>(
      sql`SELECT name FROM payload_migrations ORDER BY id`,
    )
    // The CLI applies files in name order; prodMigrations uses index.ts. They must agree.
    expect(rows.map((r) => r.name)).toEqual(migrations.map((m) => m.name))
  })
})
