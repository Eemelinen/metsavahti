import { revalidateTag, unstable_cache, updateTag } from 'next/cache'
import type { Payload } from 'payload'

import { countUnreadAlerts } from '@/lib/alerts/unread'
import { type Logger, logger as rootLogger } from '@/lib/logger'
import type { User } from '@/payload-types'

/**
 * Longest time the cached badge can lag behind a change nothing invalidated: an alert written
 * outside a Next.js request (`pnpm jobs:run`, the admin panel) or deleted by the weekly cleanup.
 */
export const BADGE_CACHE_SECONDS = 300

/** Cache tag of one account's unread-alert count (MV-083: `alerts:<userId>`). */
export const alertsTag = (userId: number): string => `alerts:${userId}`

/**
 * The nav badge's count (`countUnreadAlerts()`), cached per account under `alertsTag()` so the
 * `(app)` layout does not count on every render. Whatever changes the count invalidates the
 * tag: the alert and watch-area Server Actions with `updateTag()` (`refreshOwnAlertBadge()`),
 * the pipeline with `revalidateTag()` for each account it alerted (`revalidateAlertBadges()`).
 * Only for a Next.js render: outside one `unstable_cache` has no cache to use.
 */
export function cachedUnreadAlertCount(payload: Payload, user: User): Promise<number> {
  return unstable_cache(
    () => countUnreadAlerts(payload, user),
    ['unread-alerts', String(user.id)],
    { tags: [alertsTag(user.id)], revalidate: BADGE_CACHE_SECONDS },
  )()
}

/** In a Server Action that changed the account's alerts: its next render counts again. */
export function refreshOwnAlertBadge(user: Pick<User, 'id'>): void {
  updateTag(alertsTag(user.id))
}

/**
 * After a pipeline run: expires the cached badge of every account that got an alert in it
 * (`createdAt` at or after `since`), so their next render counts again; no push to an open
 * page (no websockets in v1). `revalidateTag()` needs a Next.js request: the cron and the
 * admin button run the pipeline inside `POST /api/jobs/run`; `pnpm jobs:run` has none, and
 * there the badges catch up within `BADGE_CACHE_SECONDS`. Never throws: a stale badge must not
 * fail a run whose alerts are already stored. Returns the accounts it expired.
 */
export async function revalidateAlertBadges(
  payload: Payload,
  since: Date,
  logger: Logger = rootLogger,
): Promise<number[]> {
  let userIds: number[]
  try {
    const { docs } = await payload.find({
      collection: 'alerts',
      where: { createdAt: { greater_than_equal: since.toISOString() } },
      select: { user: true },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    userIds = [...new Set(docs.map((a) => (typeof a.user === 'number' ? a.user : a.user.id)))]
  } catch (err) {
    logger.warn({ err }, 'could not read the accounts alerted in this run')
    return []
  }
  try {
    for (const id of userIds) revalidateTag(alertsTag(id), { expire: 0 })
  } catch (err) {
    // Next.js throws when there is no request to attach the revalidation to.
    logger.info({ err, accounts: userIds.length }, 'alert badges not revalidated: no request')
    return []
  }
  return userIds
}
