import { type Payload, ValidationError } from 'payload'

import { describeUserAgent } from '@/lib/account/user-agent'
import { readSessionToken, sessionTokenFromCookies } from '@/lib/auth/session'
import { logger } from '@/lib/logger'
import type { User } from '@/payload-types'

/**
 * Login sessions of an account (E04 MV-051, D-023): the list on `/tili/turvallisuus`,
 * "Kirjaa ulos muista laitteista" and the bookkeeping behind them. Payload's
 * `users.sessions` (`useSessions`) decides whether a session is live; the `user-sessions`
 * collection adds the browser and the last-seen time, which Payload does not keep.
 */

/** A session's `lastSeenAt` is written at most this often (one write per page view would be wasteful). */
export const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000

/** Longest `User-Agent` kept; real ones are a few hundred characters. */
const MAX_USER_AGENT_LENGTH = 512

/**
 * The session id (`sid`) of the request's `payload-token` cookie when it belongs to `user`,
 * otherwise `null`. Call it only after `requireUser()` has accepted the session: this reads
 * the claims, the database check has already been made.
 */
export function currentSessionId(
  payload: Payload,
  headers: Headers,
  user: Pick<User, 'id'>,
): string | null {
  const token = sessionTokenFromCookies(headers, payload.config.cookiePrefix)
  if (!token) return null
  const claims = readSessionToken(token, payload.secret)
  if (!claims || claims.collection !== 'users' || claims.id !== user.id) return null
  return claims.sid ?? null
}

/**
 * Note that `sid` was used just now from `userAgent`: the first request of a session creates
 * its row (with the browser it was seen from), later ones move `lastSeenAt` forward once per
 * `LAST_SEEN_INTERVAL_MS`. Runs on every page and action that resolves a session
 * (`lib/auth/guards.ts`), so it never throws: the device list is a convenience, the request
 * is not.
 */
export async function recordSessionSeen(
  payload: Payload,
  {
    user,
    sid,
    userAgent,
    now = Date.now(),
  }: { user: Pick<User, 'id'>; sid: string; userAgent: string | null; now?: number },
): Promise<void> {
  try {
    const { docs } = await payload.find({
      collection: 'user-sessions',
      where: { sid: { equals: sid } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const row = docs[0]
    const lastSeenAt = new Date(now).toISOString()
    if (!row) {
      await payload.create({
        collection: 'user-sessions',
        data: {
          user: user.id,
          sid,
          userAgent: userAgent?.slice(0, MAX_USER_AGENT_LENGTH) || null,
          lastSeenAt,
        },
        depth: 0,
        overrideAccess: true,
      })
      return
    }
    if (now - Date.parse(row.lastSeenAt) < LAST_SEEN_INTERVAL_MS) return
    await payload.update({
      collection: 'user-sessions',
      id: row.id,
      data: { lastSeenAt },
      depth: 0,
      overrideAccess: true,
    })
  } catch (error) {
    // Two first requests of one session at once: the other one created the row (unique `sid`).
    if (error instanceof ValidationError) return
    logger.warn({ err: error }, 'recording the session failed')
  }
}

export interface SessionListItem {
  /** The session id; never shown, used as the list key. */
  id: string
  /** "Chrome, Windows" (`describeUserAgent()`). */
  device: string
  /** When the session started (the login). */
  createdAt: string | null
  /** When the session was last used, at `LAST_SEEN_INTERVAL_MS` precision; the login time before that. */
  lastSeenAt: string | null
  /** The session of the request that asks: "Tämä laite". */
  current: boolean
  /** Used within the last `LAST_SEEN_INTERVAL_MS` (the list says "nyt"); always true for `current`. */
  activeNow: boolean
}

async function liveSessions(payload: Payload, userId: number, now: number) {
  const user = await payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })
  return (user.sessions ?? []).filter((session) => Date.parse(session.expiresAt) > now)
}

/**
 * The account's live sessions for `/tili/turvallisuus`: the current one first, then the most
 * recently seen. Rows of sessions that have ended (logout, expiry, password change) are
 * deleted on the way, so `user-sessions` never grows past the live sessions of the accounts
 * that look at the list.
 */
export async function listUserSessions(
  payload: Payload,
  user: Pick<User, 'id'>,
  currentSid: string | null,
  now: number = Date.now(),
): Promise<SessionListItem[]> {
  const live = await liveSessions(payload, user.id, now)
  const { docs: rows } = await payload.find({
    collection: 'user-sessions',
    where: { user: { equals: user.id } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const liveIds = new Set(live.map((session) => session.id))
  const ended = rows.filter((row) => !liveIds.has(row.sid)).map((row) => row.id)
  if (ended.length > 0) {
    await payload.delete({
      collection: 'user-sessions',
      where: { id: { in: ended } },
      depth: 0,
      overrideAccess: true,
    })
  }
  const bySid = new Map(rows.map((row) => [row.sid, row]))
  const items = live.map((session): SessionListItem => {
    const row = bySid.get(session.id)
    const lastSeenAt = row?.lastSeenAt ?? session.createdAt ?? null
    const current = session.id === currentSid
    return {
      id: session.id,
      device: describeUserAgent(row?.userAgent),
      createdAt: session.createdAt ?? null,
      lastSeenAt,
      current,
      activeNow:
        current || (lastSeenAt !== null && now - Date.parse(lastSeenAt) < LAST_SEEN_INTERVAL_MS),
    }
  })
  const seen = (item: SessionListItem) => (item.lastSeenAt ? Date.parse(item.lastSeenAt) : 0)
  return items.sort((a, b) => Number(b.current) - Number(a.current) || seen(b) - seen(a))
}

/**
 * "Kirjaa ulos muista laitteista", and the second half of a password change: every session of
 * the account except `keepSid` ends, on any device, at once (Payload's strategy requires the
 * token's session id to be listed). Returns how many sessions ended. Like Payload's own
 * logout, only `sessions` changes; `updatedAt` stays.
 */
export async function endOtherSessions(
  payload: Payload,
  user: Pick<User, 'id'>,
  keepSid: string | null,
): Promise<number> {
  const current = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
  })
  const sessions = current.sessions ?? []
  const remaining = sessions.filter((session) => session.id === keepSid)
  const ended = sessions.length - remaining.length
  if (ended > 0) {
    await payload.db.updateOne({
      id: user.id,
      collection: 'users',
      data: { sessions: remaining, updatedAt: null },
      returning: false,
    })
  }
  await payload.delete({
    collection: 'user-sessions',
    where: {
      and: [{ user: { equals: user.id } }, ...(keepSid ? [{ sid: { not_equals: keepSid } }] : [])],
    },
    depth: 0,
    overrideAccess: true,
  })
  return ended
}

/** "2.9.2026 klo 14.05" in the account's time zone (`users.timezone`). */
export function formatSessionTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('fi-FI', {
    timeZone,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}
