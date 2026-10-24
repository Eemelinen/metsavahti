import { randomUUID } from 'node:crypto'

import {
  type Payload,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
} from 'payload'

import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { checkToken, signToken } from '@/lib/tokens'

/** As long as the map image of the same email (`01 §9`, ticket MV-073: 30 d). */
export const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

/** The public page every genuine link lands on; `tila` picks its copy. */
export const UNSUBSCRIBE_PAGE_PATH = '/ilmoitukset-lopetettu'

export type UnsubscribeOutcome = 'unsubscribed' | 'used' | 'expired' | 'invalid'

/** `?tila=` of the landing page for each outcome but `invalid` (that one answers 400). */
export const UNSUBSCRIBE_PAGE_STATE = {
  unsubscribed: 'lopetettu',
  used: 'kaytetty',
  expired: 'vanhentunut',
} as const satisfies Record<Exclude<UnsubscribeOutcome, 'invalid'>, string>

/**
 * The per-area opt-out link of an alert email: purpose `unsub`, `sub` = the owner,
 * `watchAreaId`, a fresh `jti` (single use, `used-tokens`), 30 days.
 */
export async function unsubscribeUrl(
  userId: number,
  watchAreaId: number,
  now: Date = new Date(),
): Promise<string> {
  const token = await signToken(
    'unsub',
    { sub: String(userId), jti: randomUUID(), watchAreaId: String(watchAreaId) },
    UNSUBSCRIBE_TOKEN_TTL_SECONDS,
    now,
  )
  return `${env.NEXT_PUBLIC_SERVER_URL}/api/notifications/unsubscribe?token=${token}`
}

/**
 * Turn off `notificationsEnabled` of the watch area a link names, without a session (`01 §4.3`).
 * The token must verify for `unsub`; a genuine but expired link, or one whose area is gone or
 * no longer the `sub`'s, changes nothing (`expired`). The `jti` goes into `used-tokens` in the
 * same transaction as the update, so a link works once: a second click, even after the owner
 * has turned the area back on, is `used` and changes nothing.
 */
export async function unsubscribeWithToken(
  payload: Payload,
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<UnsubscribeOutcome> {
  if (!token) return 'invalid'
  const checked = await checkToken('unsub', token, now)
  if (checked.status === 'invalid') return 'invalid'
  const { sub, jti, watchAreaId, exp } = checked.claims
  if (typeof watchAreaId !== 'string' || !/^[1-9]\d{0,9}$/.test(watchAreaId)) return 'invalid'
  if (checked.status === 'expired') return 'expired'

  const used = await payload.find({
    collection: 'used-tokens',
    where: { jti: { equals: jti } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (used.docs.length > 0) return 'used'

  const area = await payload.findByID({
    collection: 'watch-areas',
    id: Number(watchAreaId),
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  const ownerId = area && (typeof area.owner === 'object' ? area.owner.id : area.owner)
  if (!area || String(ownerId) !== sub) return 'expired'

  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    await payload.create({
      collection: 'used-tokens',
      data: {
        jti,
        purpose: 'unsub',
        expiresAt: new Date((exp ?? 0) * 1000).toISOString(),
      },
      overrideAccess: true,
      req,
    })
    await payload.update({
      collection: 'watch-areas',
      id: area.id,
      data: { notificationsEnabled: false },
      overrideAccess: true,
      req,
    })
    await commitTransaction(req)
  } catch (error) {
    await killTransaction(req)
    // A concurrent click recorded the same `jti` first (unique index): that one did the work.
    const raced = await payload.find({
      collection: 'used-tokens',
      where: { jti: { equals: jti } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (raced.docs.length > 0) return 'used'
    throw error
  }
  logger.info({ watchAreaId: area.id, userId: sub }, 'notifications turned off by link')
  return 'unsubscribed'
}

/**
 * `GET /api/notifications/unsubscribe?token=`: 400 for a missing, malformed or forged token,
 * otherwise 303 to `/ilmoitukset-lopetettu?tila=…` (the confirmation page with the login link),
 * so a reload of the page never repeats the request.
 */
export async function unsubscribeResponse(
  payload: Payload,
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url)
  const outcome = await unsubscribeWithToken(payload, url.searchParams.get('token'), now)
  if (outcome === 'invalid') {
    return Response.json(
      { ok: false, error: 'invalid_token' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const target = new URL(UNSUBSCRIBE_PAGE_PATH, env.NEXT_PUBLIC_SERVER_URL)
  target.searchParams.set('tila', UNSUBSCRIBE_PAGE_STATE[outcome])
  return new Response(null, {
    status: 303,
    headers: { Location: target.toString(), 'Cache-Control': 'no-store' },
  })
}
