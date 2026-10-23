import { createHmac } from 'node:crypto'

import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { redirect } from 'next/navigation'

import { env } from '@/lib/env'
import { RateLimited, toErrorResponse } from '@/lib/errors'

export type RateLimitDecision = {
  allowed: boolean
  /** Requests left in the window after this one (0 when denied). */
  remaining: number
  /** Seconds until the window has room for one more request (0 when allowed). */
  retryAfterSeconds: number
}

type WindowOptions = {
  /** Requests allowed per key within `windowMs`. */
  limit: number
  windowMs: number
  /** Epoch milliseconds of the request being counted. */
  at: number
}

/**
 * Where the counted requests live. `hit()` must decide and record atomically per key, so
 * that concurrent requests (several Node processes included) cannot both take the last slot.
 */
export type RateLimitStore = {
  hit(key: string, options: WindowOptions): Promise<RateLimitDecision>
  /** Forget every key that starts with `prefix` (tests). */
  clear(prefix: string): Promise<void>
}

/**
 * How often expired keys are swept (at most once per interval per process, and on the first
 * request after a start), so a row outlives its window by at most this long.
 */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000

/**
 * The sliding window itself, shared by both stores: drop the timestamps that left the
 * window, then either count this request or refuse it with the time until the oldest
 * request that still blocks it leaves.
 */
function slideWindow(
  stamps: readonly number[],
  { limit, windowMs, at }: WindowOptions,
): { stamps: number[]; decision: RateLimitDecision } {
  const live = stamps.filter((t) => t > at - windowMs)
  if (live.length >= limit) {
    const blocking = live[live.length - limit]!
    return {
      stamps: live,
      decision: {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((blocking + windowMs - at) / 1000)),
      },
    }
  }
  live.push(at)
  return {
    stamps: live,
    decision: { allowed: true, remaining: limit - live.length, retryAfterSeconds: 0 },
  }
}

/**
 * Store kept in process memory: one array of timestamps per key. Counts are per process and
 * reset on restart; the unit tests use it so they need no database (`tests/unit/setup.ts`).
 */
export function memoryRateLimitStore(): RateLimitStore {
  const hits = new Map<string, { stamps: number[]; expiresAt: number }>()
  let lastSweep = -Infinity

  return {
    async hit(key, options) {
      if (options.at - lastSweep >= SWEEP_INTERVAL_MS) {
        lastSweep = options.at
        for (const [k, bucket] of hits) if (bucket.expiresAt <= options.at) hits.delete(k)
      }
      const { stamps, decision } = slideWindow(hits.get(key)?.stamps ?? [], options)
      hits.set(key, { stamps, expiresAt: stamps[stamps.length - 1]! + options.windowMs })
      return decision
    },
    async clear(prefix) {
      for (const key of hits.keys()) if (key.startsWith(prefix)) hits.delete(key)
    },
  }
}

async function drizzle() {
  const [{ getPayload }, { default: config }] = await Promise.all([
    import('payload'),
    import('@payload-config'),
  ])
  const payload = await getPayload({ config })
  return (payload.db as unknown as PostgresAdapter).drizzle
}

/**
 * Store in the Postgres `rate_limit_buckets` table (MV-048, D-021): one row per key whose
 * `hits` column holds the counted timestamps. Each `hit()` runs in a transaction that makes
 * sure the row exists, locks it (`FOR UPDATE`), applies the window and writes the result,
 * so the count is shared by every process and survives a restart. Rows whose `expires_at`
 * has passed are deleted at most every `SWEEP_INTERVAL_MS` per process.
 */
function postgresRateLimitStore(): RateLimitStore {
  let lastSweep = -Infinity

  return {
    async hit(key, options) {
      const db = await drizzle()
      const at = new Date(options.at).toISOString()
      if (options.at - lastSweep >= SWEEP_INTERVAL_MS) {
        lastSweep = options.at
        await db.execute(sql`DELETE FROM rate_limit_buckets WHERE expires_at <= ${at}::timestamptz`)
      }
      return db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO rate_limit_buckets (key, hits, expires_at)
          VALUES (${key}, '[]'::jsonb, ${at}::timestamptz)
          ON CONFLICT (key) DO NOTHING
        `)
        const { rows } = await tx.execute<{ hits: number[] }>(sql`
          SELECT hits FROM rate_limit_buckets WHERE key = ${key} FOR UPDATE
        `)
        const { stamps, decision } = slideWindow(rows[0]?.hits ?? [], options)
        const expiresAt = new Date(stamps[stamps.length - 1]! + options.windowMs).toISOString()
        await tx.execute(sql`
          UPDATE rate_limit_buckets
          SET hits = ${JSON.stringify(stamps)}::jsonb,
              expires_at = ${expiresAt}::timestamptz,
              updated_at = now()
          WHERE key = ${key}
        `)
        return decision
      })
    },
    async clear(prefix) {
      const db = await drizzle()
      await db.execute(sql`DELETE FROM rate_limit_buckets WHERE starts_with(key, ${prefix})`)
    },
  }
}

let defaultStore: RateLimitStore = postgresRateLimitStore()

/**
 * Replace the store of every limiter created without an explicit `store` (the unit tests
 * switch to `memoryRateLimitStore()`, which needs no database).
 */
export function setDefaultRateLimitStore(store: RateLimitStore): void {
  defaultStore = store
}

export type RateLimiterOptions = {
  /** Namespace of this limiter's keys; two limiters with different windows never share one. */
  name: string
  /**
   * Requests allowed per key within `windowMs`. A function is read on every check, so a limit
   * from `env` is never evaluated at import time (`next build` runs with `SKIP_ENV_VALIDATION`,
   * where `env` applies no defaults).
   */
  limit: number | (() => number)
  windowMs: number
  /** Injected in tests. */
  now?: () => number
  /** Defaults to the Postgres store (`setDefaultRateLimitStore()` changes it). */
  store?: RateLimitStore
}

/**
 * The stored key: the limiter's name in clear (so `reset()` can match it), the caller's key
 * (`register:ip:203.0.113.9`, an email address …) as an HMAC with `PAYLOAD_SECRET`, so the
 * table never holds a client address or an email address (D-021).
 */
export function bucketKey(name: string, key: string): string {
  return `${name}:${createHmac('sha256', env.PAYLOAD_SECRET).update(key).digest('base64url')}`
}

export type RateLimiter = {
  /** Count one request for `key` and say whether it is within the limit. */
  check(key: string): Promise<RateLimitDecision>
  /** `check()` that throws `RateLimited` (mapped to 429 / `rate_limited`) when over the limit. */
  assert(key: string): Promise<void>
  /** Forget every key of this limiter (tests). */
  reset(): Promise<void>
}

/** Sliding-window rate limiter (`limit` requests per `windowMs` per key). */
export function createRateLimiter({
  name,
  limit,
  windowMs,
  now = Date.now,
  store,
}: RateLimiterOptions): RateLimiter {
  const validLimit = (value: number) => {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name}: limit must be ≥ 1`)
    return value
  }
  if (typeof limit === 'number') validLimit(limit)
  const currentLimit = typeof limit === 'number' ? () => limit : () => validLimit(limit())
  const resolve = () => store ?? defaultStore

  async function check(key: string): Promise<RateLimitDecision> {
    return resolve().hit(bucketKey(name, key), { limit: currentLimit(), windowMs, at: now() })
  }

  return {
    check,
    async assert(key) {
      const decision = await check(key)
      if (!decision.allowed) throw new RateLimited(decision.retryAfterSeconds)
    },
    async reset() {
      await resolve().clear(`${name}:`)
    },
  }
}

/**
 * Key for one route and one client: the signed-in user when there is one (an account is
 * limited wherever it connects from), otherwise the client address from `clientIp()`
 * (`unknown` when no proxy header names it).
 */
export function rateLimitKey(
  route: string,
  client: { userId?: number | string | null; ip?: string | null },
): string {
  if (client.userId !== undefined && client.userId !== null) return `${route}:user:${client.userId}`
  return `${route}:ip:${client.ip ?? 'unknown'}`
}

/** Where a form post over its limit lands (`03-pages.md`, App.dc.html#route=rajoitus). */
export const TOO_MANY_REQUESTS_PATH = '/liikaa-pyyntoja'

/**
 * For Server Actions that a form posts to: count the request and, over the limit, redirect
 * to `/liikaa-pyyntoja` (a 303 when the form posts without JavaScript, a client navigation otherwise).
 */
export async function limitFormPost(limiter: RateLimiter, key: string): Promise<void> {
  const { allowed } = await limiter.check(key)
  if (!allowed) redirect(TOO_MANY_REQUESTS_PATH)
}

/**
 * For Route Handlers: count the request and return `null` within the limit, or the JSON
 * 429 (`{ ok: false, error: { code: 'rate_limited', … } }` with `Retry-After`) to send back.
 */
export async function limitApiRequest(limiter: RateLimiter, key: string): Promise<Response | null> {
  const { allowed, retryAfterSeconds } = await limiter.check(key)
  return allowed ? null : toErrorResponse(new RateLimited(retryAfterSeconds))
}

/**
 * Limiter for the auth Server Actions (`01 §8`: registration 5/h/IP). The window is one hour;
 * the count comes from `AUTH_RATE_LIMIT_PER_HOUR` (default 5, which the test suites keep),
 * read per check so importing this module never touches `env`.
 * Keys are `rateLimitKey(<action>, { ip })`, so each action has its own budget.
 */
export const authRateLimiter = createRateLimiter({
  name: 'auth',
  limit: () => env.AUTH_RATE_LIMIT_PER_HOUR,
  windowMs: 60 * 60 * 1000,
})
