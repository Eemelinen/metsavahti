import { env } from '@/lib/env'
import { RateLimited } from '@/lib/errors'

export type RateLimitDecision = {
  allowed: boolean
  /** Requests left in the window after this one (0 when denied). */
  remaining: number
  /** Seconds until the oldest counted request leaves the window (0 when allowed). */
  retryAfterSeconds: number
}

export type RateLimiterOptions = {
  /** Requests allowed per key within `windowMs`. */
  limit: number
  windowMs: number
  /** Injected in tests. */
  now?: () => number
}

export type RateLimiter = {
  /** Count one request for `key` and say whether it is within the limit. */
  check(key: string): RateLimitDecision
  /** `check()` that throws `RateLimited` (mapped to 429 / `rate_limited`) when over the limit. */
  assert(key: string): void
  /** Forget every key (tests). */
  reset(): void
}

/** How often (in `check()` calls) idle keys are swept so the map cannot grow without bound. */
const SWEEP_EVERY = 1_000

/**
 * Sliding-window rate limiter kept in process memory: one array of timestamps per key,
 * pruned on every call. Good enough for a single Node instance (the deployment target,
 * `docs/TECH_STACK.md`); MV-048 replaces the store with the Postgres `rate_limit_buckets`
 * table behind the same `check` / `assert` interface, so callers do not change.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>()
  let calls = 0

  function sweep(at: number) {
    for (const [key, stamps] of hits) {
      if (stamps.length === 0 || stamps[stamps.length - 1]! <= at - windowMs) hits.delete(key)
    }
  }

  function check(key: string): RateLimitDecision {
    const at = now()
    if (++calls % SWEEP_EVERY === 0) sweep(at)
    const stamps = (hits.get(key) ?? []).filter((t) => t > at - windowMs)
    if (stamps.length >= limit) {
      hits.set(key, stamps)
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((stamps[0]! + windowMs - at) / 1000)),
      }
    }
    stamps.push(at)
    hits.set(key, stamps)
    return { allowed: true, remaining: limit - stamps.length, retryAfterSeconds: 0 }
  }

  return {
    check,
    assert(key) {
      const decision = check(key)
      if (!decision.allowed) throw new RateLimited(decision.retryAfterSeconds)
    },
    reset() {
      hits.clear()
    },
  }
}

/**
 * Limiter for the auth Server Actions (`01 §8`: registration 5/h/IP). The window is one hour;
 * the count comes from `AUTH_RATE_LIMIT_PER_HOUR` (default 5, which the test suites keep).
 */
export const authRateLimiter = createRateLimiter({
  limit: env.AUTH_RATE_LIMIT_PER_HOUR,
  windowMs: 60 * 60 * 1000,
})
