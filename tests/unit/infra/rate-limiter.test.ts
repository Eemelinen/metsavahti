import { describe, expect, it } from 'vitest'

import { RateLimited, publicMessages } from '@/lib/errors'
import {
  TOO_MANY_REQUESTS_PATH,
  bucketKey,
  createRateLimiter,
  limitApiRequest,
  limitFormPost,
  memoryRateLimitStore,
  rateLimitKey,
} from '@/lib/rate-limit'

/** MV-048: the sliding window, key namespaces, keys per IP/user/route and the two helpers. */
describe('rate limiter', () => {
  it('allows `limit` requests per window and then denies with a retry hint', async () => {
    let now = 1_000_000
    const limiter = createRateLimiter({ name: 't', limit: 5, windowMs: 60_000, now: () => now })
    for (let i = 1; i <= 5; i += 1) {
      await expect(limiter.check('ip:1')).resolves.toEqual({
        allowed: true,
        remaining: 5 - i,
        retryAfterSeconds: 0,
      })
    }
    now += 10_000
    await expect(limiter.check('ip:1')).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 50,
    })
    // Another key is independent.
    await expect(limiter.check('ip:2')).resolves.toMatchObject({ allowed: true })
    // The window slides: the five requests share a timestamp and leave together after 60 s.
    now += 50_000
    await expect(limiter.check('ip:1')).resolves.toMatchObject({ allowed: true, remaining: 4 })
  })

  it('slides request by request: the retry hint names the oldest request still blocking', async () => {
    let now = 0
    const limiter = createRateLimiter({ name: 'slide', limit: 2, windowMs: 10_000, now: () => now })
    await limiter.check('k')
    now = 4_000
    await limiter.check('k')
    now = 5_000
    await expect(limiter.check('k')).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 5,
    })
    now = 10_001
    await expect(limiter.check('k')).resolves.toMatchObject({ allowed: true, remaining: 0 })
    await expect(limiter.check('k')).resolves.toMatchObject({
      allowed: false,
      retryAfterSeconds: 4,
    })
  })

  it('assert() throws RateLimited with the retry-after seconds; reset() forgets the keys', async () => {
    const limiter = createRateLimiter({ name: 'assert', limit: 1, windowMs: 30_000, now: () => 0 })
    await limiter.assert('k')
    const thrown = await limiter.assert('k').catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(RateLimited)
    expect((thrown as RateLimited).retryAfterSeconds).toBe(30)
    expect((thrown as RateLimited).toActionError()).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 30,
    })
    await limiter.reset()
    await expect(limiter.assert('k')).resolves.toBeUndefined()
  })

  it('keeps limiters that share a store apart by name, also on reset()', async () => {
    const store = memoryRateLimitStore()
    const strict = createRateLimiter({ name: 'a', limit: 1, windowMs: 60_000, store })
    const loose = createRateLimiter({ name: 'b', limit: 3, windowMs: 60_000, store })
    await strict.check('same')
    await expect(loose.check('same')).resolves.toMatchObject({ allowed: true, remaining: 2 })
    await loose.reset()
    await expect(strict.check('same')).resolves.toMatchObject({ allowed: false })
  })

  it('refuses a limit below one', () => {
    expect(() => createRateLimiter({ name: 'x', limit: 0, windowMs: 1 })).toThrow(/limit/)
  })

  it('reads a limit function on each check, not at creation', async () => {
    let limit = Number.NaN
    const limiter = createRateLimiter({
      name: 'lazy',
      limit: () => limit,
      windowMs: 60_000,
      now: () => 0,
      store: memoryRateLimitStore(),
    })
    await expect(limiter.check('k')).rejects.toThrow(/limit/)
    limit = 1
    await expect(limiter.check('k')).resolves.toMatchObject({ allowed: true })
    await expect(limiter.check('k')).resolves.toMatchObject({ allowed: false })
  })
})

describe('rateLimitKey', () => {
  it('keys a signed-in user by id and a guest by address, per route', () => {
    expect(rateLimitKey('geocode', { userId: 7, ip: '203.0.113.9' })).toBe('geocode:user:7')
    expect(rateLimitKey('register', { ip: '203.0.113.9' })).toBe('register:ip:203.0.113.9')
    expect(rateLimitKey('register', { userId: null, ip: null })).toBe('register:ip:unknown')
  })
})

describe('bucketKey', () => {
  it('keeps the limiter name and replaces the key with a stable HMAC', () => {
    const stored = bucketKey('auth', 'register:ip:203.0.113.9')
    expect(stored).toMatch(/^auth:[\w-]{43}$/)
    expect(stored).not.toContain('203.0.113.9')
    expect(bucketKey('auth', 'register:ip:203.0.113.9')).toBe(stored)
    expect(bucketKey('auth', 'register:ip:203.0.113.10')).not.toBe(stored)
  })
})

describe('rate-limit helpers', () => {
  it('limitFormPost redirects to /liikaa-pyyntoja once the limit is used up', async () => {
    const limiter = createRateLimiter({ name: 'form', limit: 1, windowMs: 60_000 })
    await expect(limitFormPost(limiter, 'k')).resolves.toBeUndefined()
    await expect(limitFormPost(limiter, 'k')).rejects.toMatchObject({
      digest: expect.stringContaining(`;${TOO_MANY_REQUESTS_PATH};`),
    })
  })

  it('limitApiRequest answers null within the limit, then a JSON 429 with Retry-After', async () => {
    const limiter = createRateLimiter({ name: 'api', limit: 1, windowMs: 60_000, now: () => 0 })
    await expect(limitApiRequest(limiter, 'k')).resolves.toBeNull()
    const response = await limitApiRequest(limiter, 'k')
    expect(response?.status).toBe(429)
    expect(response?.headers.get('Retry-After')).toBe('60')
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      error: { code: 'rate_limited', message: publicMessages.rate_limited, retryAfterSeconds: 60 },
    })
  })
})
