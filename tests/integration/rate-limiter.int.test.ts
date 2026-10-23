import { type MigrateUpArgs, type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { headers } from 'next/headers'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { requestPasswordReset } from '@/app/(frontend)/(auth)/unohtunut-salasana/actions'
import { env } from '@/lib/env'
import {
  TOO_MANY_REQUESTS_PATH,
  authRateLimiter,
  bucketKey,
  createRateLimiter,
  limitApiRequest,
  rateLimitKey,
} from '@/lib/rate-limit'
import * as migration from '@/payload/migrations/20261023_121838_rate_limit_buckets'
import { getTestPayload, resetDatabase } from '../helpers/payload'

// The Server Action runs without a request context; only `headers()` is stubbed.
vi.mock('next/headers', () => ({ headers: vi.fn() }))

async function drizzle() {
  const payload = await getTestPayload()
  return (payload.db as unknown as PostgresAdapter).drizzle
}

/** The stored row of `name`'s `key` (the key part is an HMAC, `bucketKey()`). */
async function bucket(name: string, key: string) {
  const { rows } = await (
    await drizzle()
  ).execute<{ hits: number[]; expires_at: string }>(sql`
    SELECT hits, expires_at FROM rate_limit_buckets WHERE key = ${bucketKey(name, key)}
  `)
  return rows[0]
}

/**
 * MV-048: the Postgres-backed sliding window (`rate_limit_buckets`): the sixth request within
 * the window is refused, the count is shared by every limiter instance (i.e. every process)
 * and holds under concurrent requests, the window slides, and the helpers answer with the
 * JSON 429 or the `/liikaa-pyyntoja` redirect.
 */
describe('rate limiter (MV-048)', () => {
  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
  })

  it('refuses the sixth request within the window and records the bucket in Postgres', async () => {
    expect(env.AUTH_RATE_LIMIT_PER_HOUR).toBe(5)
    const key = rateLimitKey('register', { ip: '203.0.113.21' })
    for (let i = 1; i <= 5; i += 1) {
      await expect(authRateLimiter.check(key)).resolves.toMatchObject({
        allowed: true,
        remaining: 5 - i,
      })
    }
    const sixth = await authRateLimiter.check(key)
    expect(sixth.allowed).toBe(false)
    expect(sixth.retryAfterSeconds).toBeGreaterThan(3590)
    expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(3600)

    const row = await bucket('auth', key)
    expect(row?.hits).toHaveLength(5)
    expect(Date.parse(row!.expires_at)).toBe(row!.hits[4]! + 60 * 60 * 1000)
    // No client address is stored in clear.
    const { rows: keys } = await (
      await drizzle()
    ).execute<{ key: string }>(sql`
      SELECT key FROM rate_limit_buckets
    `)
    expect(keys.map((r) => r.key).filter((k) => k.includes('203.0.113'))).toEqual([])

    // Another address and another route have their own budgets.
    await expect(
      authRateLimiter.check(rateLimitKey('register', { ip: '203.0.113.22' })),
    ).resolves.toMatchObject({ allowed: true })
    await expect(
      authRateLimiter.check(rateLimitKey('forgot', { ip: '203.0.113.21' })),
    ).resolves.toMatchObject({ allowed: true })
  })

  it('shares the count between limiter instances and keeps it under concurrent requests', async () => {
    // Two instances with the same name stand in for two Node processes.
    const first = createRateLimiter({ name: 'int-shared', limit: 5, windowMs: 60_000 })
    const second = createRateLimiter({ name: 'int-shared', limit: 5, windowMs: 60_000 })
    const key = rateLimitKey('geocode', { userId: 42 })
    const decisions = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? first : second).check(key)),
    )
    expect(decisions.filter((d) => d.allowed)).toHaveLength(5)
    expect((await bucket('int-shared', key))?.hits).toHaveLength(5)
  })

  it('slides: requests leave the window one by one', async () => {
    let now = Date.parse('2026-10-23T12:00:00Z')
    const limiter = createRateLimiter({
      name: 'int-slide',
      limit: 5,
      windowMs: 60_000,
      now: () => now,
    })
    for (let i = 0; i < 5; i += 1) {
      await limiter.check('k')
      now += 10_000
    }
    // 50 s after the first request: full, and the first one leaves in 10 s.
    await expect(limiter.check('k')).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 10,
    })
    now += 10_000
    await expect(limiter.check('k')).resolves.toMatchObject({ allowed: true, remaining: 0 })
    expect((await bucket('int-slide', 'k'))?.hits).toHaveLength(5)

    await limiter.reset()
    expect(await bucket('int-slide', 'k')).toBeUndefined()
  })

  it('answers Route Handlers with the JSON 429 and Retry-After', async () => {
    const limiter = createRateLimiter({ name: 'int-api', limit: 5, windowMs: 60_000 })
    const key = rateLimitKey('preview', { userId: 7 })
    for (let i = 0; i < 5; i += 1) await expect(limitApiRequest(limiter, key)).resolves.toBeNull()
    const response = await limitApiRequest(limiter, key)
    expect(response?.status).toBe(429)
    expect(Number(response?.headers.get('Retry-After'))).toBeGreaterThan(0)
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'rate_limited' },
    })
  })

  it('sends the sixth /unohtunut-salasana post from one address to /liikaa-pyyntoja', async () => {
    vi.mocked(headers).mockResolvedValue(
      new Headers({ 'x-forwarded-for': '203.0.113.30' }) as never,
    )
    for (let i = 0; i < 5; i += 1) {
      // An unknown address: Payload sends nothing, the answer is the neutral confirmation.
      await expect(requestPasswordReset({ email: `nobody-${i}@metsavahti.test` })).resolves.toEqual(
        { ok: true, data: { sent: true } },
      )
    }
    await expect(requestPasswordReset({ email: 'nobody@metsavahti.test' })).rejects.toMatchObject({
      digest: expect.stringContaining(`;${TOO_MANY_REQUESTS_PATH};`),
    })
    expect((await bucket('auth', 'forgot:ip:203.0.113.30'))?.hits).toHaveLength(5)
  })

  it('migration round-trip drops and recreates the table (runs last)', async () => {
    const db = await drizzle()
    const args = { db } as unknown as MigrateUpArgs
    const tables = async () =>
      (
        await db.execute<{ n: number }>(sql`
          SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'rate_limit_buckets'
        `)
      ).rows[0]!.n

    await migration.down(args)
    expect(await tables()).toBe(0)
    await migration.up(args)
    expect(await tables()).toBe(1)
    const { rows } = await db.execute<{ indexdef: string }>(sql`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'rate_limit_buckets_key_idx'
    `)
    expect(rows[0]?.indexdef).toMatch(/UNIQUE INDEX/)
    await expect(authRateLimiter.check('after-round-trip')).resolves.toMatchObject({
      allowed: true,
    })
  })
})
