import type { Payload } from 'payload'

import { visibleAlertsWhere } from '@/lib/alerts/feed'
import { assertOwner } from '@/lib/auth/page-access'
import { NotFound } from '@/lib/errors'
import type { User } from '@/payload-types'

/**
 * Unread alerts of `user` for the nav badge (MV-050: `alerts.readAt IS NULL`), of the change
 * types the feed shows (MV-080), so the badge never counts an alert the feed hides. Filters on
 * `user` explicitly: the collection's read access lets an admin see every user's alerts, and
 * the badge must count only the viewer's own.
 */
export async function countUnreadAlerts(payload: Payload, user: User): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'alerts',
    user,
    overrideAccess: false,
    where: visibleAlertsWhere(user, { unreadOnly: true }),
  })
  return totalDocs
}

/**
 * Stamps `readAt` on one of the account's alerts (MV-080 `markAlertRead`); an alert already
 * read keeps its first `readAt`. A missing alert is `NotFound`; someone else's is `Forbidden`
 * for everyone, admins included (`assertOwner()`: the app pages are personal).
 */
export async function markAlertRead(
  payload: Payload,
  user: User,
  id: number,
  now: Date = new Date(),
): Promise<{ id: number; readAt: string }> {
  const alert = await payload.findByID({
    collection: 'alerts',
    id,
    select: { user: true, readAt: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })
  if (!alert) throw new NotFound()
  assertOwner(user, alert)
  if (alert.readAt) return { id, readAt: alert.readAt }

  const readAt = now.toISOString()
  await payload.update({
    collection: 'alerts',
    id,
    data: { readAt },
    depth: 0,
    overrideAccess: false,
    user,
  })
  return { id, readAt }
}

/**
 * Stamps `readAt` on every unread alert of the account the feed shows, of one watch area when
 * `watchAreaId` is given (the feed's filter: the button marks what the list shows). Returns how
 * many alerts changed.
 */
export async function markAllAlertsRead(
  payload: Payload,
  user: User,
  { watchAreaId = null, now = new Date() }: { watchAreaId?: number | null; now?: Date } = {},
): Promise<{ count: number }> {
  const { docs } = await payload.update({
    collection: 'alerts',
    where: visibleAlertsWhere(user, { watchAreaId, unreadOnly: true }),
    data: { readAt: now.toISOString() },
    depth: 0,
    overrideAccess: false,
    user,
  })
  return { count: docs.length }
}
