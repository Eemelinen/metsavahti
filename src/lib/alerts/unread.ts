import type { Payload } from 'payload'

import type { User } from '@/payload-types'

/**
 * Unread alerts of `user` for the nav badge (MV-050: `alerts.readAt IS NULL`). Filters on
 * `user` explicitly: the collection's read access lets an admin see every user's alerts, and
 * the badge must count only the viewer's own.
 */
export async function countUnreadAlerts(payload: Payload, user: User): Promise<number> {
  const { totalDocs } = await payload.count({
    collection: 'alerts',
    user,
    overrideAccess: false,
    where: { and: [{ user: { equals: user.id } }, { readAt: { exists: false } }] },
  })
  return totalDocs
}
