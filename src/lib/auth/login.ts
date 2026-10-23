import {
  AuthenticationError,
  LockedAuth,
  type Payload,
  UnverifiedEmail,
  ValidationError,
  createLocalReq,
  loginOperation,
} from 'payload'

import { sessionTtlSeconds } from '@/lib/auth/login-schema'
import { readSessionToken, sessionTokenFromCookies } from '@/lib/auth/session'
import type { User } from '@/payload-types'

export type LoginCredentials = {
  email: string
  password: string
  /** "Muista minut": a 30-day session instead of one day. */
  remember: boolean
}

export type LoginOutcome =
  /** Credentials accepted; `token` is the session JWT to set as the cookie, valid `ttlSeconds`. */
  | { status: 'ok'; token: string; ttlSeconds: number; user: User }
  /** Unknown address or wrong password (never told apart), or unusable input. */
  | { status: 'invalid' }
  /** `maxLoginAttempts` failures in a row; Payload refuses even the right password until `lockTime` passes. */
  | { status: 'locked' }
  /** Right password, but the address was never verified; the page offers a resend. */
  | { status: 'unverified'; email: string }

/**
 * Log a user in for a session of the requested length (E03 MV-044). Payload's login operation
 * takes the token lifetime from the collection config only, so it is called with a copy of the
 * `users` config whose `tokenExpiration` is the chosen length: the JWT `exp` and the
 * server-side session (`useSessions`) then agree in Payload's own single write, and the
 * admin UI keeps the collection's default. Failed attempts count towards Payload's lockout
 * (`maxLoginAttempts` 5, `lockTime` 10 min) exactly as through the REST endpoint; the
 * verified flag is only checked after the password, so "unverified" never reveals an account
 * to someone without its password.
 */
export async function loginUser(
  payload: Payload,
  { email, password, remember }: LoginCredentials,
): Promise<LoginOutcome> {
  const ttlSeconds = sessionTtlSeconds(remember)
  const collection = payload.collections.users
  if (!collection) throw new Error('users collection is not registered')
  const req = await createLocalReq({}, payload)
  try {
    const { token, user } = await loginOperation<'users'>({
      collection: {
        ...collection,
        config: {
          ...collection.config,
          auth: { ...collection.config.auth, tokenExpiration: ttlSeconds },
        },
      },
      data: { email, password },
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (!token || !user) throw new Error('login returned no token')
    return { status: 'ok', token, ttlSeconds, user }
  } catch (error) {
    if (error instanceof LockedAuth) return { status: 'locked' }
    if (error instanceof UnverifiedEmail) return { status: 'unverified', email }
    if (error instanceof AuthenticationError || error instanceof ValidationError) {
      return { status: 'invalid' }
    }
    throw error
  }
}

/** The options Next's `cookies().set()` and `NextResponse.cookies.set()` accept. */
export type SessionCookie = {
  name: string
  value: string
  httpOnly: true
  path: '/'
  sameSite: 'lax' | 'strict' | 'none'
  secure: boolean
  domain?: string
  maxAge: number
}

function cookieBase(payload: Payload): Omit<SessionCookie, 'value' | 'maxAge'> {
  const auth = payload.collections.users?.config.auth
  const configured = auth?.cookies.sameSite
  const sameSite =
    typeof configured === 'string'
      ? (configured.toLowerCase() as SessionCookie['sameSite'])
      : configured
        ? 'strict'
        : 'lax'
  return {
    name: `${payload.config.cookiePrefix}-token`,
    httpOnly: true,
    path: '/',
    sameSite,
    secure: Boolean(auth?.cookies.secure),
    ...(auth?.cookies.domain ? { domain: auth.cookies.domain } : {}),
  }
}

/**
 * The `payload-token` cookie for a session, with the same attributes Payload's own login
 * endpoint uses (`HttpOnly`, `Path=/`, `SameSite` and `Secure` from the collection's
 * `auth.cookies`) and a `Max-Age` equal to the token lifetime.
 */
export function sessionCookie(payload: Payload, token: string, ttlSeconds: number): SessionCookie {
  return { ...cookieBase(payload), value: token, maxAge: ttlSeconds }
}

/** The same cookie, expired: what a logout response sets. */
export function expiredSessionCookie(payload: Payload): SessionCookie {
  return { ...cookieBase(payload), value: '', maxAge: 0 }
}

/**
 * `/kirjaudu-ulos`: drop the session named by the request's cookie from `users.sessions`, so
 * the token stops working everywhere (Payload's strategy requires the session id to be
 * listed) even if a copy of the cookie survives. Works for an unverified account too, which
 * `payload.auth()` would not name. Returns whether a session was removed; a guest, a forged
 * or an already-ended session is a no-op, not an error, so logging out is always safe.
 */
export async function endSession(payload: Payload, headers: Headers): Promise<boolean> {
  const token = sessionTokenFromCookies(headers, payload.config.cookiePrefix)
  if (!token) return false
  const claims = readSessionToken(token, payload.secret)
  if (!claims || claims.collection !== 'users' || !claims.sid) return false
  const user = await payload.findByID({
    collection: 'users',
    id: claims.id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!user) return false
  const sessions = user.sessions ?? []
  const remaining = sessions.filter((session) => session.id !== claims.sid)
  if (remaining.length === sessions.length) return false
  // Like Payload's own logout: only the sessions change, `updatedAt` stays.
  await payload.db.updateOne({
    id: user.id,
    collection: 'users',
    data: { sessions: remaining, updatedAt: null },
    returning: false,
  })
  return true
}
