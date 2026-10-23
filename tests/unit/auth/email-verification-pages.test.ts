import { headers } from 'next/headers'
import { jwtSign } from 'payload'
import type * as PayloadModule from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resendVerification } from '@/app/(frontend)/(auth)/vahvista-sahkoposti/actions'
import type * as Verification from '@/lib/auth/verification'
import {
  findUnverifiedSessionUser,
  readSessionToken,
  sessionTokenFromCookies,
} from '@/lib/auth/session'
import {
  VERIFICATION_LINK_TTL_MS,
  isVerificationLinkExpired,
  resendCooldownLimiter,
  resendVerificationEmail,
  verificationRequiredPath,
} from '@/lib/auth/verification'
import { RESEND_COOLDOWN_SECONDS } from '@/lib/auth/verification-schema'
import { fi } from '@/i18n/fi'
import { publicMessages } from '@/lib/errors'
import { authRateLimiter } from '@/lib/rate-limit'

// The `resendVerification` action runs without a request context: `headers()` is stubbed,
// Payload is never booted and `resendVerificationEmail` is a spy (its real body is covered
// by the integration test).
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  getPayload: vi.fn(async () => ({})),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/auth/verification', async (importOriginal) => ({
  ...(await importOriginal<typeof Verification>()),
  resendVerificationEmail: vi.fn(async () => ({ status: 'sent' })),
}))

const SECRET = 'a'.repeat(32)
const HOUR = 60 * 60 * 1000

/** MV-043: link expiry, the resend action's limits and the unverified-session guard. */
describe('verification link expiry', () => {
  const now = Date.parse('2026-09-20T12:00:00Z')

  it('is valid for exactly 24 h from the send time', () => {
    expect(VERIFICATION_LINK_TTL_MS).toBe(24 * HOUR)
    const sentAt = new Date(now - 24 * HOUR).toISOString()
    expect(isVerificationLinkExpired(sentAt, now)).toBe(false)
    expect(isVerificationLinkExpired(sentAt, now + 1)).toBe(true)
    expect(isVerificationLinkExpired(new Date(now - HOUR).toISOString(), now)).toBe(false)
  })

  it('treats a missing or unreadable send time as expired', () => {
    expect(isVerificationLinkExpired(null, now)).toBe(true)
    expect(isVerificationLinkExpired(undefined, now)).toBe(true)
    expect(isVerificationLinkExpired('eilen', now)).toBe(true)
  })

  it('builds the interstitial path with the encoded address', () => {
    expect(verificationRequiredPath('anna.k@example.fi')).toBe(
      '/vahvista-sahkoposti?email=anna.k%40example.fi&required=1',
    )
  })
})

describe('resendVerification action', () => {
  function requestFrom(ip: string) {
    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': ip }) as never)
  }

  beforeEach(() => {
    authRateLimiter.reset()
    resendCooldownLimiter.reset()
    vi.mocked(resendVerificationEmail).mockClear()
    requestFrom('203.0.113.9')
  })

  it('sends once and then refuses the same address for 60 s with the remaining seconds', async () => {
    await expect(resendVerification({ email: 'Anna.K@Example.fi' })).resolves.toEqual({
      ok: true,
      data: { cooldownSeconds: RESEND_COOLDOWN_SECONDS },
    })
    expect(resendVerificationEmail).toHaveBeenCalledWith({}, 'anna.k@example.fi')

    const second = await resendVerification({ email: 'anna.k@example.fi' })
    expect(second).toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: publicMessages.rate_limited,
        retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
      },
    })
    expect(resendVerificationEmail).toHaveBeenCalledTimes(1)

    // Another address from the same client is not in the cooldown.
    await expect(resendVerification({ email: 'bertta@example.fi' })).resolves.toMatchObject({
      ok: true,
    })
  })

  it('answers an unknown or verified address exactly like a pending one', async () => {
    vi.mocked(resendVerificationEmail).mockResolvedValueOnce({ status: 'skipped' })
    await expect(resendVerification({ email: 'nobody@example.fi' })).resolves.toEqual({
      ok: true,
      data: { cooldownSeconds: RESEND_COOLDOWN_SECONDS },
    })
  })

  it('counts every call against the per-IP auth limit, invalid input included', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(resendVerification({ email: 'ei-osoite' })).resolves.toEqual({
        ok: false,
        error: { code: 'internal', message: fi.auth.register.errors.emailInvalid },
      })
    }
    await expect(resendVerification({ email: 'anna.k@example.fi' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'rate_limited', retryAfterSeconds: 3600 },
    })
    expect(resendVerificationEmail).not.toHaveBeenCalled()
    requestFrom('203.0.113.10')
    await expect(resendVerification({ email: 'anna.k@example.fi' })).resolves.toMatchObject({
      ok: true,
    })
  })
})

describe('session cookie peek', () => {
  const now = Date.parse('2026-09-20T12:00:00Z')

  async function sign(fields: Record<string, unknown>, secret = SECRET, expiresIn = 3600) {
    vi.useFakeTimers({ now })
    try {
      const { token } = await jwtSign({ fieldsToSign: fields, secret, tokenExpiration: expiresIn })
      return token
    } finally {
      vi.useRealTimers()
    }
  }

  it('reads the claims of a token Payload signed and rejects everything else', async () => {
    const token = await sign({ id: 7, collection: 'users', sid: 'abc', email: 'a@b.fi' })
    expect(readSessionToken(token, SECRET, now)).toEqual({ id: 7, collection: 'users', sid: 'abc' })
    expect(readSessionToken(token, 'b'.repeat(32), now)).toBeNull()
    expect(readSessionToken(token, SECRET, now + 3601 * 1000)).toBeNull()
    expect(readSessionToken(`${token}x`, SECRET, now)).toBeNull()
    expect(readSessionToken('not.a.token', SECRET, now)).toBeNull()
    expect(readSessionToken('', SECRET, now)).toBeNull()
    const noSid = await sign({ id: 7, collection: 'users' })
    expect(readSessionToken(noSid, SECRET, now)).toEqual({
      id: 7,
      collection: 'users',
      sid: undefined,
    })
  })

  it('finds the payload-token cookie by prefix', () => {
    const headers = new Headers({ cookie: 'mv_consent=%7B%7D; payload-token=abc%3Ddef; other=1' })
    expect(sessionTokenFromCookies(headers)).toBe('abc=def')
    expect(sessionTokenFromCookies(headers, 'mv')).toBeNull()
    expect(sessionTokenFromCookies(new Headers())).toBeNull()
  })

  it('returns the user only for a live session of an unverified account', async () => {
    const token = await sign({ id: 7, collection: 'users', sid: 'sid-1' })
    const user = {
      id: 7,
      email: 'anna.k@example.fi',
      _verified: false,
      sessions: [{ id: 'sid-1', expiresAt: new Date(now + HOUR).toISOString() }],
    }
    const findByID = vi.fn(async () => user)
    const payload = { secret: SECRET, config: {}, findByID } as never
    const headers = new Headers({ cookie: `payload-token=${token}` })

    await expect(findUnverifiedSessionUser(payload, headers, now)).resolves.toBe(user)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 7, overrideAccess: true }),
    )

    findByID.mockResolvedValueOnce({ ...user, _verified: true })
    await expect(findUnverifiedSessionUser(payload, headers, now)).resolves.toBeNull()
    findByID.mockResolvedValueOnce({ ...user, sessions: [] })
    await expect(findUnverifiedSessionUser(payload, headers, now)).resolves.toBeNull()
    findByID.mockResolvedValueOnce({
      ...user,
      sessions: [{ id: 'sid-1', expiresAt: new Date(now - 1).toISOString() }],
    })
    await expect(findUnverifiedSessionUser(payload, headers, now)).resolves.toBeNull()
    await expect(findUnverifiedSessionUser(payload, new Headers(), now)).resolves.toBeNull()
    await expect(
      findUnverifiedSessionUser(payload, new Headers({ cookie: 'payload-token=forged' }), now),
    ).resolves.toBeNull()
    expect(findByID).toHaveBeenCalledTimes(4)
  })

  it('keeps the interstitial copy of the artboard', () => {
    expect(fi.auth.verifyEmail.required.title).toBe('Vahvista sähköpostiosoitteesi ensin')
    expect(fi.auth.verify.verified.cta).toBe('Luo ensimmäinen vahtialue')
  })
})
