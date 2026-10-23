import { type Payload, getPayload } from 'payload'
import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'

import type { User } from '@/payload-types'

let instance: Payload | undefined

/** Boots Payload once per process against process.env.DATABASE_URL. */
export async function getTestPayload(): Promise<Payload> {
  if (instance) return instance
  const { default: config } = await import('@payload-config')
  instance = await getPayload({ config })
  return instance
}

/** Wipe all application tables between test files (fast, keeps schema + migrations). */
export async function resetDatabase(payload: Payload): Promise<void> {
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('payload_migrations', 'spatial_ref_sys')
  `)
  if (rows.length === 0) return
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ')
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`))
}

let userSeq = 0

/** Create a verified user via the Local API (bypasses field access for `_verified`). */
export async function createTestUser(
  payload: Payload,
  overrides: Partial<{
    email: string
    password: string
    role: 'admin' | 'user'
    name: string
  }> = {},
): Promise<User & { password: string }> {
  userSeq += 1
  const password = overrides.password ?? 'Test-password-123'
  const user = await payload.create({
    collection: 'users',
    data: {
      email: overrides.email ?? `user${userSeq}-${Date.now()}@metsavahti.test`,
      password,
      name: overrides.name ?? `Test user ${userSeq}`,
      role: overrides.role ?? 'user',
      _verified: true,
    },
    overrideAccess: true,
  })
  return { ...user, password }
}
