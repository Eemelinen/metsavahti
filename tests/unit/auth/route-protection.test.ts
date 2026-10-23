import { headers } from 'next/headers'
import { NextRequest } from 'next/server'
import { getPayload, jwtSign } from 'payload'
import type * as PayloadModule from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSessionUser, redirectSignedInUser, requireUser } from '@/lib/auth/guards'
import { assertOwner, pageDecision } from '@/lib/auth/page-access'
import {
  GUEST_ONLY_PATHS,
  type ProxyOptions,
  handleRequest,
  routeAccess,
} from '@/lib/auth/route-protection'
import { hasSessionToken, payloadSecretKey } from '@/lib/auth/session'
import { Forbidden, Unauthorized, actionResult, publicMessages } from '@/lib/errors'
import {
  ADMIN_CONTENT_SECURITY_POLICY,
  STATIC_SECURITY_HEADERS,
  contentSecurityPolicy,
  createNonce,
} from '@/lib/security-headers'

// The guards run without a request context: `headers()` is stubbed and `getPayload()` returns
// a fake whose `auth()` / `findByID()` the tests set (the real ones run in the integration matrix).
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  getPayload: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))

const SECRET_KEY = payloadSecretKey('test-only-payload-secret-not-for-production')
const NOW = Date.parse('2026-10-23T12:00:00Z')

async function signSession(fields: Record<string, unknown>, secret = SECRET_KEY, ttl = 3600) {
  vi.useFakeTimers({ now: NOW })
  try {
    return (await jwtSign({ fieldsToSign: fields, secret, tokenExpiration: ttl })).token
  } finally {
    vi.useRealTimers()
  }
}

function digestOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'digest' in error
    ? String(error.digest)
    : ''
}

const options: ProxyOptions = {
  maintenance: false,
  secretKey: SECRET_KEY,
  dev: false,
  https: false,
  nonce: () => 'bm9uY2U=',
  now: () => NOW,
}

function request(path: string, init: { cookie?: string } = {}) {
  return new NextRequest(new URL(path, 'http://localhost:3100'), {
    headers: init.cookie ? { cookie: init.cookie } : {},
  })
}

describe('route table (03-pages.md Auth column)', () => {
  it('marks the (app) prefixes as user routes and nothing that merely starts like one', () => {
    for (const path of ['/dashboard', '/aloita', '/vahtialueet', '/vahtialueet/3/muokkaa']) {
      expect(routeAccess(path)).toBe('user')
    }
    for (const path of ['/ilmoitukset/9', '/tili', '/tili/turvallisuus']) {
      expect(routeAccess(path)).toBe('user')
    }
    expect(routeAccess('/tili-poistettu')).toBe('public')
    expect(routeAccess('/dashboardx')).toBe('public')
  })

  it('marks the guest-only auth pages and leaves the rest public', () => {
    expect(GUEST_ONLY_PATHS).toEqual(['/kirjaudu', '/rekisteroidy', '/unohtunut-salasana'])
    for (const path of GUEST_ONLY_PATHS) expect(routeAccess(path)).toBe('guest-only')
    for (const path of ['/', '/vahvista-sahkoposti', '/vahvista', '/uusi-salasana', '/huolto']) {
      expect(routeAccess(path)).toBe('public')
    }
  })
})

describe('content security policy', () => {
  it('allows scripts only by nonce, forbids framing and objects', () => {
    const csp = contentSecurityPolicy({ nonce: 'abc', dev: false, https: false })
    const directives = Object.fromEntries(
      csp.split('; ').map((d) => {
        const [name, ...values] = d.split(' ')
        return [name, values]
      }),
    )
    expect(directives['script-src']).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['img-src']).toContain('https://tile.openstreetmap.org')
    expect(directives['connect-src']).toContain('https://tile.openstreetmap.org')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  it('adds eval only in development, the https upgrade and the Sentry origin when asked', () => {
    const csp = contentSecurityPolicy({
      nonce: 'abc',
      dev: true,
      https: true,
      sentryDsn: 'https://key@o1.ingest.sentry.io/42',
    })
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'")
    expect(csp).toContain('https://o1.ingest.sentry.io')
    expect(csp.endsWith('upgrade-insecure-requests')).toBe(true)
  })

  it('creates a fresh 128-bit nonce per call', () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce))
    expect(nonces.size).toBe(50)
    for (const nonce of nonces) expect(atob(nonce)).toHaveLength(16)
  })
})

describe('proxy decision (handleRequest)', () => {
  it('lets a public page through with the nonce on the request and every security header', () => {
    const response = handleRequest(request('/'), options)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe('bm9uY2U=')
    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("'nonce-bm9uY2U='")
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(csp)
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value)
    }
    expect(response.headers.get('strict-transport-security')).toContain('max-age=63072000')
  })

  it('sends a user route without a session cookie to the login with the full return address', () => {
    const response = handleRequest(request('/vahtialueet/3?tab=ilmoitukset'), options)
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'http://localhost:3100/kirjaudu?next=%2Fvahtialueet%2F3%3Ftab%3Dilmoitukset',
    )
    expect(response.headers.get('x-frame-options')).toBe('DENY')
  })

  it('lets a signed, unexpired users token through and refuses forged or expired ones', async () => {
    const valid = await signSession({ id: 1, collection: 'users', sid: 's' })
    const passed = handleRequest(
      request('/dashboard', { cookie: `payload-token=${valid}` }),
      options,
    )
    expect(passed.headers.get('x-middleware-next')).toBe('1')

    const forged = await signSession({ id: 1, collection: 'users' }, 'b'.repeat(32))
    const expired = await signSession({ id: 1, collection: 'users' }, SECRET_KEY, 1)
    const later = { ...options, now: () => NOW + 2000 }
    for (const [cookie, opts] of [
      [`payload-token=${forged}`, options],
      [`payload-token=${expired}`, later],
      ['payload-token=nonsense', options],
    ] as const) {
      const response = handleRequest(request('/dashboard', { cookie }), opts)
      expect(response.headers.get('location')).toBe(
        'http://localhost:3100/kirjaudu?next=%2Fdashboard',
      )
    }
  })

  it('leaves guest-only pages to the page itself (it can tell a revoked session apart)', async () => {
    const valid = await signSession({ id: 1, collection: 'users', sid: 's' })
    const response = handleRequest(
      request('/kirjaudu', { cookie: `payload-token=${valid}` }),
      options,
    )
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('in maintenance mode redirects pages, answers 503 on the API and spares the probe', () => {
    const maintenance = { ...options, maintenance: true }
    for (const path of ['/', '/dashboard', '/kirjaudu', '/admin']) {
      const response = handleRequest(request(path), maintenance)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3100/huolto')
    }
    const api = handleRequest(request('/api/users/me'), maintenance)
    expect(api.status).toBe(503)
    expect(api.headers.get('retry-after')).toBe('600')
    for (const path of ['/huolto', '/api/health']) {
      expect(handleRequest(request(path), maintenance).headers.get('x-middleware-next')).toBe('1')
    }
  })

  it('gives the Payload admin only the framing ban', () => {
    const response = handleRequest(request('/admin/collections/users'), options)
    expect(response.headers.get('content-security-policy')).toBe(ADMIN_CONTENT_SECURITY_POLICY)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('session token check', () => {
  it('derives the signing key the way Payload hashes PAYLOAD_SECRET', () => {
    expect(SECRET_KEY).toMatch(/^[0-9a-f]{32}$/)
    expect(payloadSecretKey('x')).not.toBe(SECRET_KEY)
  })

  it('accepts only a users token', async () => {
    const admin = await signSession({ id: 1, collection: 'admins' })
    const user = await signSession({ id: 1, collection: 'users' })
    expect(hasSessionToken(new Headers({ cookie: `payload-token=${user}` }), SECRET_KEY, NOW)).toBe(
      true,
    )
    expect(
      hasSessionToken(new Headers({ cookie: `payload-token=${admin}` }), SECRET_KEY, NOW),
    ).toBe(false)
    expect(hasSessionToken(new Headers(), SECRET_KEY, NOW)).toBe(false)
  })
})

const verified = { id: 7, email: 'anna.k@example.fi' } as never
const unverified = { id: 8, email: 'ville.v@example.fi' } as never

describe('pageDecision', () => {
  it('lets a verified user into a user page and sends the others away', () => {
    expect(pageDecision('user', { status: 'user', user: verified }, '/tili')).toEqual({
      type: 'allow',
    })
    expect(pageDecision('user', { status: 'guest' }, '/tili')).toEqual({
      type: 'redirect',
      to: '/kirjaudu?next=%2Ftili',
    })
    expect(pageDecision('user', { status: 'unverified', user: unverified }, '/tili')).toEqual({
      type: 'redirect',
      to: '/vahvista-sahkoposti?email=ville.v%40example.fi&required=1',
    })
  })

  it('sends a signed-in user away from a guest-only page, to a safe next only', () => {
    const user = { status: 'user', user: verified } as const
    expect(pageDecision('guest-only', user, '/vahtialueet/3')).toEqual({
      type: 'redirect',
      to: '/vahtialueet/3',
    })
    expect(pageDecision('guest-only', user, '//evil.example')).toEqual({
      type: 'redirect',
      to: '/dashboard',
    })
    expect(pageDecision('guest-only', { status: 'guest' }, '/dashboard')).toEqual({
      type: 'allow',
    })
    // An unverified account may use the login page (to log in again, or to resend the link).
    expect(pageDecision('guest-only', { status: 'unverified', user: unverified }, '/')).toEqual({
      type: 'allow',
    })
  })
})

describe('assertOwner', () => {
  it('accepts the owner by id or populated relation, on owner and user fields', () => {
    expect(() => assertOwner({ id: 7 }, { owner: 7 })).not.toThrow()
    expect(() => assertOwner({ id: 7 }, { owner: { id: 7 } })).not.toThrow()
    expect(() => assertOwner({ id: 7 }, { user: 7 })).not.toThrow()
  })

  it('throws Forbidden for anyone else or a missing owner', () => {
    expect(() => assertOwner({ id: 7 }, { owner: 8 })).toThrow(Forbidden)
    expect(() => assertOwner({ id: 7 }, { user: { id: 8 } })).toThrow(Forbidden)
    expect(() => assertOwner({ id: 7 }, { owner: null })).toThrow(Forbidden)
  })
})

describe('session helpers and the actionResult wrapper', () => {
  afterEach(() => vi.mocked(getPayload).mockReset())

  function fakePayload({ user = null as unknown, unverifiedUser = null as unknown } = {}) {
    vi.mocked(getPayload).mockResolvedValue({
      auth: vi.fn(async () => ({
        user: user ? { ...(user as object), collection: 'users' } : null,
      })),
      findByID: vi.fn(async () => unverifiedUser),
      secret: SECRET_KEY,
      config: {},
    } as never)
  }

  it('getSessionUser returns the verified user and null otherwise', async () => {
    fakePayload({ user: verified })
    await expect(getSessionUser()).resolves.toMatchObject({ id: 7 })
    fakePayload()
    await expect(getSessionUser()).resolves.toBeNull()
  })

  it('maps a bare requireUser() for a guest to { ok: false, unauthorized }', async () => {
    fakePayload()
    await expect(actionResult(() => requireUser())).resolves.toEqual({
      ok: false,
      error: { code: 'unauthorized', message: publicMessages.unauthorized },
    })
    await expect(requireUser()).rejects.toBeInstanceOf(Unauthorized)
  })

  it('maps assertOwner on someone else’s document to { ok: false, forbidden }', async () => {
    fakePayload({ user: verified })
    const result = await actionResult(async () => {
      const user = await requireUser()
      assertOwner(user, { owner: 99 })
      return { deleted: true }
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'forbidden', message: publicMessages.forbidden },
    })
    await expect(
      actionResult(async () => {
        const user = await requireUser()
        assertOwner(user, { owner: 7 })
        return { deleted: true }
      }),
    ).resolves.toEqual({ ok: true, data: { deleted: true } })
  })

  it('redirects a guest on a page to the login, and an unverified session to the interstitial', async () => {
    fakePayload()
    await expect(requireUser({ next: '/tili' })).rejects.toSatisfy((e) =>
      digestOf(e).includes(';/kirjaudu?next=%2Ftili;'),
    )

    const token = await signSession({ id: 8, collection: 'users', sid: 'sid-1' })
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ cookie: `payload-token=${token}` }) as never,
    )
    fakePayload({
      unverifiedUser: {
        id: 8,
        email: 'ville.v@example.fi',
        _verified: false,
        sessions: [{ id: 'sid-1', expiresAt: new Date(NOW + 3_600_000).toISOString() }],
      },
    })
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    try {
      await expect(requireUser({ next: '/tili' })).rejects.toSatisfy((e) =>
        digestOf(e).includes(';/vahvista-sahkoposti?email=ville.v%40example.fi&required=1;'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends a signed-in user away from a guest-only page and lets a guest stay', async () => {
    fakePayload({ user: verified })
    await expect(redirectSignedInUser('/vahtialueet')).rejects.toSatisfy((e) =>
      digestOf(e).includes(';/vahtialueet;'),
    )
    fakePayload()
    await expect(redirectSignedInUser()).resolves.toBeUndefined()
  })
})
