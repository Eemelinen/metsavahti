import { cookies } from 'next/headers'
import type * as PayloadModule from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { login } from '@/app/(frontend)/(auth)/kirjaudu/actions'
import { LOGGED_OUT_PATH, POST as logout } from '@/app/(frontend)/kirjaudu-ulos/route'
import { fi } from '@/i18n/fi'
import type * as Login from '@/lib/auth/login'
import { endSession, expiredSessionCookie, loginUser, sessionCookie } from '@/lib/auth/login'
import {
  DEFAULT_AFTER_LOGIN,
  LOGIN_PATH,
  SESSION_TTL_SECONDS,
  loginFormSchema,
  loginPath,
  safeNextPath,
  sessionTtlSeconds,
} from '@/lib/auth/login-schema'
import { publicMessages } from '@/lib/errors'

// The action and the route run without a request context: `cookies()` is stubbed, Payload is
// never booted and `loginUser` / `endSession` are spies (their real bodies are covered by the
// integration test). The cookie helpers are the real ones, fed a minimal Payload shape.
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof PayloadModule>()),
  getPayload: vi.fn(async () => fakePayload),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/auth/login', async (importOriginal) => ({
  ...(await importOriginal<typeof Login>()),
  loginUser: vi.fn(),
  endSession: vi.fn(async () => true),
}))

const fakePayload = {
  config: { cookiePrefix: 'payload' },
  collections: {
    users: { config: { auth: { cookies: { sameSite: 'Lax', secure: false } } } },
  },
} as unknown as PayloadModule.Payload

const DAY = 24 * 60 * 60

describe('?next= handling (same-origin only)', () => {
  it('keeps absolute paths on this origin, with query and hash', () => {
    expect(safeNextPath('/vahtialueet/3')).toBe('/vahtialueet/3')
    expect(safeNextPath('/dashboard?tab=alueet#kartta')).toBe('/dashboard?tab=alueet#kartta')
    expect(safeNextPath('/')).toBe('/')
  })

  it('falls back to the app home for anything that could leave the origin or loop', () => {
    for (const bad of [
      undefined,
      null,
      '',
      'dashboard',
      'https://example.com/',
      '//example.com/',
      '/\\example.com',
      '/vahti\\alueet',
      '/vahtialueet\n',
      '/vahtialueet\u0000',
      'javascript:alert(1)',
      LOGIN_PATH,
      `${LOGIN_PATH}?next=%2Fdashboard`,
      `${LOGIN_PATH}/x`,
      `/${'a'.repeat(2048)}`,
      ['/dashboard'],
    ]) {
      expect(safeNextPath(bad)).toBe(DEFAULT_AFTER_LOGIN)
    }
    expect(safeNextPath('https://example.com/', '/muu')).toBe('/muu')
  })

  it('loginPath adds the encoded return address', () => {
    expect(loginPath()).toBe('/kirjaudu')
    expect(loginPath(DEFAULT_AFTER_LOGIN)).toBe('/kirjaudu?next=%2Fdashboard')
    expect(loginPath('/vahtialueet/3?x=1')).toBe('/kirjaudu?next=%2Fvahtialueet%2F3%3Fx%3D1')
  })
})

describe('session length and cookie', () => {
  it('is 30 days with remember-me and one day without', () => {
    expect(SESSION_TTL_SECONDS).toEqual({ remembered: 30 * DAY, standard: DAY })
    expect(sessionTtlSeconds(true)).toBe(30 * DAY)
    expect(sessionTtlSeconds(false)).toBe(DAY)
  })

  it('mirrors the collection cookie settings and sets Max-Age to the session length', () => {
    expect(sessionCookie(fakePayload, 'tok', DAY)).toEqual({
      name: 'payload-token',
      value: 'tok',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
      maxAge: DAY,
    })
    const strict = {
      config: { cookiePrefix: 'mv' },
      collections: {
        users: { config: { auth: { cookies: { sameSite: true, secure: true, domain: 'x.fi' } } } },
      },
    } as unknown as PayloadModule.Payload
    expect(sessionCookie(strict, 'tok', 30 * DAY)).toMatchObject({
      name: 'mv-token',
      sameSite: 'strict',
      secure: true,
      domain: 'x.fi',
      maxAge: 30 * DAY,
    })
    expect(expiredSessionCookie(fakePayload)).toEqual({
      name: 'payload-token',
      value: '',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
      maxAge: 0,
    })
  })

  it('the form schema normalises the address and only requires a password', () => {
    expect(
      loginFormSchema.parse({ email: 'Anna.K@Example.fi', password: 'x', remember: true }),
    ).toEqual({ email: 'anna.k@example.fi', password: 'x', remember: true })
    const failed = loginFormSchema.safeParse({ email: 'anna', password: '', remember: false })
    expect(failed.success).toBe(false)
    expect(failed.error?.issues.map((i) => i.message)).toEqual([
      fi.auth.login.errors.emailInvalid,
      fi.auth.login.errors.passwordMissing,
    ])
  })
})

describe('login action', () => {
  const set = vi.fn()
  const valid = { email: 'anna.k@example.fi', password: 'kuusi-metsa-jarvi-2026', remember: false }

  beforeEach(() => {
    set.mockReset()
    vi.mocked(cookies).mockResolvedValue({ set } as never)
    vi.mocked(loginUser).mockReset()
  })

  it('returns field errors for unusable input without touching Payload', async () => {
    await expect(login({ email: 'anna', password: '', remember: false })).resolves.toEqual({
      ok: false,
      fieldErrors: {
        email: fi.auth.login.errors.emailInvalid,
        password: fi.auth.login.errors.passwordMissing,
      },
    })
    expect(loginUser).not.toHaveBeenCalled()
  })

  it('passes each refusal through as `denied`', async () => {
    for (const denied of [
      { status: 'invalid' },
      { status: 'locked' },
      { status: 'unverified', email: valid.email },
    ] as const) {
      vi.mocked(loginUser).mockResolvedValueOnce(denied)
      await expect(login(valid)).resolves.toEqual({ ok: false, denied })
    }
    expect(set).not.toHaveBeenCalled()
  })

  it('sets the session cookie for the chosen length and redirects to a safe next', async () => {
    vi.mocked(loginUser).mockResolvedValue({
      status: 'ok',
      token: 'tok',
      ttlSeconds: 30 * DAY,
      user: {} as never,
    })
    await expect(
      login({ ...valid, remember: true, next: 'https://example.com/' }),
    ).rejects.toMatchObject({ digest: expect.stringContaining(DEFAULT_AFTER_LOGIN) })
    expect(loginUser).toHaveBeenCalledWith(fakePayload, { ...valid, remember: true })
    expect(set).toHaveBeenCalledWith(sessionCookie(fakePayload, 'tok', 30 * DAY))

    await expect(login({ ...valid, next: '/vahtialueet/3' })).rejects.toMatchObject({
      digest: expect.stringContaining('/vahtialueet/3'),
    })
  })

  it('maps an unexpected failure to the generic error', async () => {
    vi.mocked(loginUser).mockRejectedValue(new Error('database down'))
    await expect(login(valid)).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: publicMessages.internal },
    })
  })
})

describe('logout route', () => {
  it('ends the session, expires the cookie and redirects with 303', async () => {
    const request = new Request('http://localhost:3100/kirjaudu-ulos', {
      method: 'POST',
      headers: { cookie: 'payload-token=tok' },
    })
    const response = await logout(request)
    expect(endSession).toHaveBeenCalledWith(fakePayload, request.headers)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`http://localhost:3100${LOGGED_OUT_PATH}`)
    expect(response.headers.get('set-cookie')).toMatch(/^payload-token=;.*Max-Age=0/)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/)
  })
})
