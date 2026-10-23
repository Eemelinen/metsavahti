import { beforeAll, describe, expect, it } from 'vitest'

import { endSession, expiredSessionCookie, loginUser, sessionCookie } from '@/lib/auth/login'
import { SESSION_TTL_SECONDS } from '@/lib/auth/login-schema'
import { readSessionToken } from '@/lib/auth/session'
import { seedLegalDocuments } from '@/lib/legal/documents'
import { registerUser } from '@/lib/auth/registration'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const PASSWORD = 'kuusi-metsa-jarvi-2026'
const MAX_LOGIN_ATTEMPTS = 5

/** Request headers a browser would send with the session cookie on a direct navigation. */
function withCookie(token: string): Headers {
  return new Headers({ cookie: `payload-token=${token}`, 'sec-fetch-site': 'none' })
}

async function readUser(id: number) {
  const payload = await getTestPayload()
  return payload.findByID({ collection: 'users', id, overrideAccess: true, showHiddenFields: true })
}

/**
 * MV-044: `loginUser()` against a real Payload: session length per remember-me, the lockout
 * after five failures, the unverified answer, and `endSession()` revoking the session.
 */
describe('login and logout (MV-044)', () => {
  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await seedLegalDocuments(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    await createTestUser(payload, { role: 'admin' })
  })

  it('issues a one-day session by default and a 30-day one with remember-me', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const now = Date.now()

    for (const [remember, ttl] of [
      [false, SESSION_TTL_SECONDS.standard],
      [true, SESSION_TTL_SECONDS.remembered],
    ] as const) {
      const outcome = await loginUser(payload, {
        email: user.email,
        password: PASSWORD_OF(user),
        remember,
      })
      expect(outcome.status).toBe('ok')
      if (outcome.status !== 'ok') return
      expect(outcome.ttlSeconds).toBe(ttl)
      expect(outcome.user.id).toBe(user.id)

      // The JWT expires when the session does …
      const claims = readSessionToken(outcome.token, payload.secret)
      expect(claims).toMatchObject({ id: user.id, collection: 'users' })
      expect(
        readSessionToken(outcome.token, payload.secret, now + ttl * 1000 - 5_000),
      ).not.toBeNull()
      expect(readSessionToken(outcome.token, payload.secret, now + ttl * 1000 + 5_000)).toBeNull()
      // … and so does the server-side session Payload recorded.
      const session = (await readUser(user.id)).sessions?.find((s) => s.id === claims!.sid)
      expect(session).toBeTruthy()
      expect(Date.parse(session!.expiresAt) - now).toBeGreaterThan(ttl * 1000 - 5_000)
      expect(Date.parse(session!.expiresAt) - now).toBeLessThan(ttl * 1000 + 5_000)
      // Payload accepts the token like one of its own.
      await expect(payload.auth({ headers: withCookie(outcome.token) })).resolves.toMatchObject({
        user: { id: user.id },
      })
      expect(sessionCookie(payload, outcome.token, outcome.ttlSeconds)).toEqual({
        name: 'payload-token',
        value: outcome.token,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false,
        maxAge: ttl,
      })
    }
    // The admin UI's own login keeps the collection default.
    expect(payload.collections.users!.config.auth.tokenExpiration).toBe(7 * 24 * 60 * 60)
  })

  it('answers "invalid" for an unknown address and for a wrong password alike', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    await expect(
      loginUser(payload, { email: 'nobody@metsavahti.test', password: PASSWORD, remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
    await expect(
      loginUser(payload, { email: user.email, password: 'wrong-password', remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
    await expect(
      loginUser(payload, { email: user.email, password: '', remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
  })

  it('locks the account after five failures and accepts the password again once the lock ends', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) {
      await expect(
        loginUser(payload, { email: user.email, password: 'wrong-password', remember: false }),
      ).resolves.toEqual({ status: 'invalid' })
    }
    const locked = await readUser(user.id)
    expect(locked.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS)
    expect(Date.parse(locked.lockUntil!)).toBeGreaterThan(Date.now())

    // The sixth attempt is refused as locked even with the right password.
    await expect(
      loginUser(payload, { email: user.email, password: PASSWORD_OF(user), remember: false }),
    ).resolves.toEqual({ status: 'locked' })

    // The lock expires (10 min): backdate it as time passing would.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { lockUntil: new Date(Date.now() - 1000).toISOString() },
      overrideAccess: true,
    })
    const after = await loginUser(payload, {
      email: user.email,
      password: PASSWORD_OF(user),
      remember: false,
    })
    expect(after.status).toBe('ok')
    const reset = await readUser(user.id)
    expect(reset.loginAttempts).toBe(0)
    expect(reset.lockUntil ?? null).toBeNull()
  })

  it('names an unverified account only when the password is right', async () => {
    const payload = await getTestPayload()
    const email = `pending-${Date.now()}@metsavahti.test`
    const outcome = await registerUser(
      payload,
      { email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, marketing: false },
      { ip: null, userAgent: null },
    )
    expect(outcome.status).toBe('created')
    await expect(
      loginUser(payload, { email, password: 'wrong-password', remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
    await expect(
      loginUser(payload, { email, password: PASSWORD, remember: false }),
    ).resolves.toEqual({ status: 'unverified', email })
  })

  it('endSession revokes the session named by the cookie and nothing else', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const first = await loginUser(payload, {
      email: user.email,
      password: PASSWORD_OF(user),
      remember: true,
    })
    const second = await loginUser(payload, {
      email: user.email,
      password: PASSWORD_OF(user),
      remember: false,
    })
    if (first.status !== 'ok' || second.status !== 'ok') throw new Error('login failed')
    const updatedAt = (await readUser(user.id)).updatedAt

    await expect(endSession(payload, withCookie(first.token))).resolves.toBe(true)
    // The first token is dead everywhere, the second still works.
    await expect(payload.auth({ headers: withCookie(first.token) })).resolves.toMatchObject({
      user: null,
    })
    await expect(payload.auth({ headers: withCookie(second.token) })).resolves.toMatchObject({
      user: { id: user.id },
    })
    expect((await readUser(user.id)).sessions).toHaveLength(1)
    expect((await readUser(user.id)).updatedAt).toBe(updatedAt)

    // Ending it again, a guest and a forged cookie are no-ops.
    await expect(endSession(payload, withCookie(first.token))).resolves.toBe(false)
    await expect(endSession(payload, new Headers())).resolves.toBe(false)
    await expect(endSession(payload, withCookie('nonsense'))).resolves.toBe(false)
    expect(expiredSessionCookie(payload)).toMatchObject({
      name: 'payload-token',
      value: '',
      maxAge: 0,
    })
  })
})

/** The password `createTestUser` returned for this account. */
function PASSWORD_OF(user: { password: string }): string {
  return user.password
}
