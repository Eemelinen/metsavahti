import { type NextRequest, NextResponse } from 'next/server'

import { hasSessionToken } from '@/lib/auth/session'
import { loginPath } from '@/lib/auth/login-schema'
import {
  ADMIN_CONTENT_SECURITY_POLICY,
  STATIC_SECURITY_HEADERS,
  contentSecurityPolicy,
  createNonce,
} from '@/lib/security-headers'

/**
 * Route protection for `src/proxy.ts` (E03 MV-046, `03-pages.md` Auth column, `01 §7`).
 *
 * The proxy cannot boot Payload, so it only makes the optimistic, database-free checks:
 * maintenance mode, the security headers and "no signed session cookie on a `user` route →
 * `/kirjaudu?next=`". Everything that needs the database (revoked session, unverified account,
 * guest-only pages for a signed-in user) is decided by the page through `requireUser()` /
 * `redirectSignedInUser()` (`lib/auth/guards.ts`), which a proxy redirect never contradicts:
 * the proxy only ever sends a request to a page that would have sent it there itself (D-020).
 */

export type RouteAccess = 'user' | 'guest-only' | 'public'

/** Route prefixes that need a verified session (`03-pages.md` `(app)` group, `01 §7`). */
export const USER_ROUTE_PREFIXES = [
  '/aloita',
  '/dashboard',
  '/vahtialueet',
  '/ilmoitukset',
  '/tili',
] as const

/** Pages a signed-in user is sent away from (`03-pages.md`: guest-only). */
export const GUEST_ONLY_PATHS = ['/kirjaudu', '/rekisteroidy', '/unohtunut-salasana'] as const

export const MAINTENANCE_PATH = '/huolto'

/** Reachable while `MAINTENANCE_MODE=1`: the maintenance page itself and the uptime probe. */
const MAINTENANCE_EXEMPT = [MAINTENANCE_PATH, '/api/health'] as const

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** The Auth column of `03-pages.md` for a path (`/tili-poistettu` is public, `/tili/x` is not). */
export function routeAccess(pathname: string): RouteAccess {
  if (USER_ROUTE_PREFIXES.some((p) => matchesPrefix(pathname, p))) return 'user'
  if ((GUEST_ONLY_PATHS as readonly string[]).includes(pathname)) return 'guest-only'
  return 'public'
}

function isMaintenanceExempt(pathname: string): boolean {
  return MAINTENANCE_EXEMPT.some((p) => matchesPrefix(pathname, p))
}

function isAdminPath(pathname: string): boolean {
  return matchesPrefix(pathname, '/admin')
}

export interface ProxyOptions {
  maintenance: boolean
  /** `payloadSecretKey(PAYLOAD_SECRET)`, the HS256 key of the session cookie. */
  secretKey: string
  dev: boolean
  https: boolean
  sentryDsn?: string
  /** Injected in tests. */
  nonce?: () => string
  now?: () => number
}

function withSecurityHeaders<T extends Response>(response: T, csp: string): T {
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(name, value)
  }
  response.headers.set('Content-Security-Policy', csp)
  return response
}

/** Seconds a client should wait before retrying during maintenance. */
const MAINTENANCE_RETRY_AFTER_SECONDS = 600

/**
 * The proxy's whole decision for one request, in order: maintenance (pages → 307 `/huolto`,
 * `/api/*` → 503 JSON), the login redirect for `user` routes without a signed session cookie,
 * then the request continues with the CSP (and its nonce) on both the request, where Next.js
 * reads the nonce, and the response.
 */
export function handleRequest(request: NextRequest, options: ProxyOptions): NextResponse {
  const { pathname, search } = request.nextUrl
  const nonce = (options.nonce ?? createNonce)()
  const csp = isAdminPath(pathname)
    ? ADMIN_CONTENT_SECURITY_POLICY
    : contentSecurityPolicy({
        nonce,
        dev: options.dev,
        https: options.https,
        sentryDsn: options.sentryDsn,
      })

  if (options.maintenance && !isMaintenanceExempt(pathname)) {
    if (matchesPrefix(pathname, '/api')) {
      const response = NextResponse.json(
        {
          ok: false,
          error: { code: 'maintenance', message: 'Metsävahti on huoltotauolla.' },
        },
        { status: 503, headers: { 'Retry-After': String(MAINTENANCE_RETRY_AFTER_SECONDS) } },
      )
      return withSecurityHeaders(response, csp)
    }
    return withSecurityHeaders(
      NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url), 307),
      csp,
    )
  }

  const now = (options.now ?? Date.now)()
  if (
    routeAccess(pathname) === 'user' &&
    !hasSessionToken(request.headers, options.secretKey, now)
  ) {
    const target = new URL(loginPath(`${pathname}${search}`), request.url)
    return withSecurityHeaders(NextResponse.redirect(target, 307), csp)
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp)
}
