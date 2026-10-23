import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import { postgisVersion } from '@/lib/geo/spatial-queries'
import { getTestPayload, resetDatabase } from '../helpers/payload'

describe('payload boot + migrations', () => {
  beforeAll(async () => {
    await resetDatabase(await getTestPayload())
  })

  it('runs against PostGIS with migrations applied', async () => {
    const payload = await getTestPayload()
    expect(await postgisVersion(payload)).toMatch(/^3\./)

    const db = (payload.db as unknown as PostgresAdapter).drizzle
    const { rows } = await db.execute<{
      table_name: string
      column_name: string
      is_generated: string
    }>(sql`
      SELECT table_name, column_name, is_generated
      FROM information_schema.columns
      WHERE (table_name = 'watch_areas' AND column_name = 'geom_3067')
         OR (table_name = 'declarations' AND column_name = 'geom')
      ORDER BY table_name
    `)
    expect(rows).toEqual([
      { table_name: 'declarations', column_name: 'geom', is_generated: 'NEVER' },
      { table_name: 'watch_areas', column_name: 'geom_3067', is_generated: 'ALWAYS' },
    ])

    const { rows: indexes } = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE indexname IN ('watch_areas_geom_3067_gist', 'declarations_geom_gist')
    `)
    expect(indexes).toHaveLength(2)
  })

  it('exposes all collections', async () => {
    const payload = await getTestPayload()
    expect(Object.keys(payload.collections)).toEqual(
      expect.arrayContaining([
        'users',
        'watch-areas',
        'declarations',
        'declaration-revisions',
        'watch-area-declarations',
        'alerts',
        'notification-log',
        'consent-events',
        'data-export-requests',
        'exports',
        'job-runs',
        'legal-documents',
        'payload-jobs',
      ]),
    )
  })
})
