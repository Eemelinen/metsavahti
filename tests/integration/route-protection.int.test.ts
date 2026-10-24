import { NextRequest } from 'next/server'
import { jwtSign } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { endSession, loginUser } from '@/lib/auth/login'
import { DEFAULT_AFTER_LOGIN } from '@/lib/auth/login-schema'
import { assertOwner, pageDecision } from '@/lib/auth/page-access'
import { handleRequest, routeAccess } from '@/lib/auth/route-protection'
import { payloadSecretKey, resolveSession } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { Forbidden } from '@/lib/errors'
import { seedLegalDocuments } from '@/lib/legal/documents'
import type { User } from '@/payload-types'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const ORIGIN = 'http://localhost:3100'
type AuthState = 'guest' | 'verified' | 'unverified' | 'revoked' | 'forged'
type Outcome = { status: 200 } | { status: 307; location: string; by: 'proxy' | 'page' }

/** The `payload-token` cookie of each auth state (none for a guest). */
const cookies: Partial<Record<AuthState, string>> = {}
let unverifiedEmail = ''

async function login(user: User & { password: string }): Promise<string> {
  const payload = await getTestPayload()
  const outcome = await loginUser(payload, {
    email: user.email,
    password: user.password,
    remember: false,
  })
  if (outcome.status !== 'ok') throw new Error(`login failed: ${outcome.status}`)
  return outcome.token
}

/**
 * One request through both layers, as the running app does it: `src/proxy.ts`'s decision
 * (`handleRequest` with the real secret) and, when it lets the request through to a `user` or
 * `guest-only` page, that page's `requireUser()` / `redirectSignedInUser()` decision against
 * the real session in the database.
 */
async function visit(path: string, state: AuthState): Promise<Outcome> {
  const cookie = cookies[state] ? `payload-token=${cookies[state]}` : undefined
  const proxied = handleRequest(
    new NextRequest(new URL(path, ORIGIN), { headers: cookie ? { cookie } : {} }),
    {
      maintenance: false,
      secretKey: payloadSecretKey(env.PAYLOAD_SECRET),
      dev: false,
      https: false,
    },
  )
  const location = proxied.headers.get('location')
  if (location) return { status: 307, location: location.replace(ORIGIN, ''), by: 'proxy' }

  const access = routeAccess(new URL(path, ORIGIN).pathname)
  if (access === 'public') return { status: 200 }
  const payload = await getTestPayload()
  // A direct navigation: Payload's cookie extraction wants `Sec-Fetch-Site` when `csrf` is set.
  const headers = new Headers({ 'sec-fetch-site': 'none', ...(cookie ? { cookie } : {}) })
  const session = await resolveSession(payload, headers)
  const decision = pageDecision(access, session, access === 'user' ? path : DEFAULT_AFTER_LOGIN)
  return decision.type === 'allow'
    ? { status: 200 }
    : { status: 307, location: decision.to, by: 'page' }
}

/** MV-046: route × auth state → status / redirect, against a real Payload. */
describe('route protection (MV-046)', () => {
  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await seedLegalDocuments(payload)
    await createTestUser(payload, { role: 'admin' })

    cookies.verified = await login(await createTestUser(payload))

    const unverified = await createTestUser(payload)
    cookies.unverified = await login(unverified)
    await payload.update({
      collection: 'users',
      id: unverified.id,
      data: { _verified: false },
      overrideAccess: true,
    })
    unverifiedEmail = unverified.email

    const revoked = await createTestUser(payload)
    cookies.revoked = await login(revoked)
    await endSession(
      payload,
      new Headers({ cookie: `payload-token=${cookies.revoked}`, 'sec-fetch-site': 'none' }),
    )

    // Well-formed and unexpired, but signed with another key.
    cookies.forged = (
      await jwtSign({
        fieldsToSign: { id: revoked.id, collection: 'users', sid: 'x' },
        secret: payloadSecretKey('someone-elses-secret-value'),
        tokenExpiration: 3600,
      })
    ).token
  })

  it('derives the same signing key as Payload, so the proxy can read the cookie', async () => {
    const payload = await getTestPayload()
    expect(payloadSecretKey(env.PAYLOAD_SECRET)).toBe(payload.secret)
  })

  const toLogin = (next: string) => ({
    status: 307,
    location: `/kirjaudu?next=${encodeURIComponent(next)}`,
  })
  const ok = { status: 200 }

  const userRoutes = ['/vahtialueet', '/vahtialueet/3?tab=ilmoitukset', '/tili/turvallisuus']
  const guestOnly = ['/kirjaudu', '/rekisteroidy', '/unohtunut-salasana']
  const publicRoutes = ['/', '/vahvista-sahkoposti', '/uusi-salasana', '/huolto', '/tili-poistettu']

  it.each(userRoutes)('user route %s', async (path) => {
    // No cookie or a forged one: the proxy answers before the page renders.
    expect(await visit(path, 'guest')).toEqual({ ...toLogin(path), by: 'proxy' })
    expect(await visit(path, 'forged')).toEqual({ ...toLogin(path), by: 'proxy' })
    // A validly signed cookie whose session was revoked: only the page can tell.
    expect(await visit(path, 'revoked')).toEqual({ ...toLogin(path), by: 'page' })
    expect(await visit(path, 'unverified')).toEqual({
      status: 307,
      location: `/vahvista-sahkoposti?email=${encodeURIComponent(unverifiedEmail)}&required=1`,
      by: 'page',
    })
    expect(await visit(path, 'verified')).toEqual(ok)
  })

  it.each(guestOnly)('guest-only route %s', async (path) => {
    for (const state of ['guest', 'forged', 'revoked', 'unverified'] as const) {
      expect(await visit(path, state)).toEqual(ok)
    }
    expect(await visit(path, 'verified')).toEqual({
      status: 307,
      location: DEFAULT_AFTER_LOGIN,
      by: 'page',
    })
  })

  it.each(publicRoutes)('public route %s', async (path) => {
    for (const state of ['guest', 'forged', 'revoked', 'unverified', 'verified'] as const) {
      expect(await visit(path, state)).toEqual(ok)
    }
  })

  it('assertOwner throws Forbidden for a real watch area of someone else', async () => {
    const payload = await getTestPayload()
    const alice = await createTestUser(payload)
    const bob = await createTestUser(payload)
    const created = await payload.create({
      collection: 'watch-areas',
      data: { name: 'Alicen mökki', center: [25.0, 62.0], radiusM: 1000, owner: alice.id },
      overrideAccess: true,
    })
    for (const depth of [0, 1]) {
      const area = await payload.findByID({
        collection: 'watch-areas',
        id: created.id,
        depth,
        overrideAccess: true,
      })
      expect(() => assertOwner(alice, area)).not.toThrow()
      expect(() => assertOwner(bob, area)).toThrow(Forbidden)
    }
  })
})
