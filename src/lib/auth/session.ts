import { createHmac, timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import type { User } from '@/payload-types'

export type SessionClaims = {
  id: number
  collection: string
  /** Session id (`useSessions`); the cookie is only valid while `users.sessions` lists it. */
  sid?: string
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Verify Payload's HS256 session token and return its claims, or `null` for anything that
 * is not a valid, unexpired token signed with `secret` (`payload.secret`, the hashed
 * `PAYLOAD_SECRET`). Payload's own JWT strategy refuses unverified accounts outright
 * (`payload.auth()` returns no user for them), so this is the only way a page can tell an
 * unverified session apart from a guest; it never grants access by itself.
 */
export function readSessionToken(
  token: string,
  secret: string,
  now = Date.now(),
): SessionClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts as [string, string, string]
  try {
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest()
    const actual = base64UrlDecode(signature)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    const alg = (JSON.parse(base64UrlDecode(header).toString('utf8')) as { alg?: unknown }).alg
    if (alg !== 'HS256') return null
    const claims = JSON.parse(base64UrlDecode(body).toString('utf8')) as Record<string, unknown>
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null
    if (typeof claims.id !== 'number' || typeof claims.collection !== 'string') return null
    return {
      id: claims.id,
      collection: claims.collection,
      sid: typeof claims.sid === 'string' ? claims.sid : undefined,
    }
  } catch {
    return null
  }
}

/** The `payload-token` cookie value from a request's `Cookie` header, if any. */
export function sessionTokenFromCookies(headers: Headers, cookiePrefix = 'payload'): string | null {
  const cookie = headers.get('cookie')
  if (!cookie) return null
  const name = `${cookiePrefix}-token=`
  for (const part of cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(name)) return decodeURIComponent(trimmed.slice(name.length))
  }
  return null
}

/**
 * The user behind the request's session cookie when that account is not verified
 * (E03 MV-043: "middleware sends unverified users to `/vahvista-sahkoposti`"), otherwise
 * `null` (guest, verified user, stale or forged cookie). The session id in the token must
 * still be listed on the user, exactly as Payload's strategy requires.
 */
export async function findUnverifiedSessionUser(
  payload: Payload,
  headers: Headers,
  now = Date.now(),
): Promise<User | null> {
  const token = sessionTokenFromCookies(headers, payload.config.cookiePrefix)
  if (!token) return null
  const claims = readSessionToken(token, payload.secret, now)
  if (!claims || claims.collection !== 'users') return null
  const user = await payload.findByID({
    collection: 'users',
    id: claims.id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!user || user._verified) return null
  const session = user.sessions?.find((s) => s.id === claims.sid)
  if (!session || Date.parse(session.expiresAt) <= now) return null
  return user
}
