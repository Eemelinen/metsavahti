import type { Payload, Where } from 'payload'

import type { CuttingColourToken } from '@/config/cutting-types'
import { visibleChangeTypes } from '@/lib/alerts/change-types'
import { type AlertFeedQuery, encodeAlertFeedCursor } from '@/lib/alerts/feed-query'
import { cuttingType } from '@/lib/wfs/codes'
import { type AlertChangeType, alertSnapshot } from '@/payload/collections/Alerts'
import type { User } from '@/payload-types'

/** Alerts per page of `/ilmoitukset` (`03-pages.md`: "paginated 50, newest first"). */
export const ALERT_FEED_PAGE_SIZE = 50

/** One `AlertItem` of the feed (App artboard `ilmoitukset`). */
export type AlertFeedItem = {
  id: number
  changeType: AlertChangeType
  unread: boolean
  watchArea: { id: number; name: string }
  declarationId: number
  /** The declaration's current cutting type (as the alert email), else the snapshot's label. */
  cuttingTypeLabel: string
  colourToken: CuttingColourToken
  /** Snapshot facts, frozen at alert time (`01 §3.5`). */
  areaHa: number | null
  distanceM: number
  /** "06.12", the alert's time in Finland. */
  time: string
}

/** Alerts of one Finnish calendar day, newest first; `label` is the header ("5.9.2026"). */
export type AlertFeedGroup = { day: string; label: string; items: AlertFeedItem[] }

export type AlertFeed = {
  groups: AlertFeedGroup[]
  /** `?ennen=` of the next page; null on the last one. */
  nextCursor: string | null
  /** The account's watch areas, for the filter. */
  watchAreas: Array<{ id: number; name: string }>
  /** The filter in effect: the `?alue=` id when it is one of the account's areas. */
  watchAreaId: number | null
  /** Unread alerts under the filter on every page ("Merkitse kaikki luetuiksi" shows when > 0). */
  unreadCount: number
}

const FINNISH_TIME_ZONE = 'Europe/Helsinki'
const DAY_KEY = new Intl.DateTimeFormat('sv-SE', { timeZone: FINNISH_TIME_ZONE })
const DAY_LABEL = new Intl.DateTimeFormat('fi-FI', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: FINNISH_TIME_ZONE,
})
const TIME = new Intl.DateTimeFormat('fi-FI', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: FINNISH_TIME_ZONE,
})

/**
 * The account's alerts the app shows: its own (filtered on `user` explicitly, as the badge:
 * an admin's read access reaches every account's alerts), of the visible change types,
 * optionally of one watch area.
 */
export function visibleAlertsWhere(
  user: Pick<User, 'id'>,
  { watchAreaId = null, unreadOnly = false }: { watchAreaId?: number | null; unreadOnly?: boolean },
): Where {
  return {
    and: [
      { user: { equals: user.id } },
      { changeType: { in: visibleChangeTypes() } },
      ...(watchAreaId === null ? [] : [{ watchArea: { equals: watchAreaId } }]),
      ...(unreadOnly ? [{ readAt: { exists: false } }] : []),
    ],
  }
}

const relationId = (ref: number | { id: number }) => (typeof ref === 'number' ? ref : ref.id)

/**
 * One page of `/ilmoitukset` (E07 MV-080): the account's alerts newest first, 50 at a time
 * from `cursor`, grouped by the Finnish calendar day they were created on. Alerts and areas are
 * read as the account; the cutting codes come from `declarations` (admin-only, so read with
 * `overrideAccess` for the ids of the account's own alerts only), the rest from the snapshot.
 */
export async function loadAlertFeed(
  payload: Payload,
  user: User,
  query: AlertFeedQuery,
): Promise<AlertFeed> {
  const { docs: areas } = await payload.find({
    collection: 'watch-areas',
    where: { owner: { equals: user.id } },
    sort: 'createdAt',
    select: { name: true },
    depth: 0,
    pagination: false,
    overrideAccess: false,
    user,
  })
  const watchAreaId = areas.some((a) => a.id === query.watchAreaId) ? query.watchAreaId : null
  const where = visibleAlertsWhere(user, { watchAreaId })
  const { cursor } = query
  const page: Where = cursor
    ? {
        and: [
          where,
          {
            or: [
              { createdAt: { less_than: cursor.createdAt } },
              {
                and: [
                  { createdAt: { equals: cursor.createdAt } },
                  { id: { less_than: cursor.id } },
                ],
              },
            ],
          },
        ],
      }
    : where

  const [{ docs: alerts }, { totalDocs: unreadCount }] = await Promise.all([
    payload.find({
      collection: 'alerts',
      where: page,
      sort: ['-createdAt', '-id'],
      limit: ALERT_FEED_PAGE_SIZE + 1,
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user,
    }),
    payload.count({
      collection: 'alerts',
      where: visibleAlertsWhere(user, { watchAreaId, unreadOnly: true }),
      overrideAccess: false,
      user,
    }),
  ])
  const shown = alerts.slice(0, ALERT_FEED_PAGE_SIZE)
  const last = shown.at(-1)

  const declarationIds = [...new Set(shown.map((a) => relationId(a.declaration)))]
  const { docs: declarations } =
    declarationIds.length === 0
      ? { docs: [] }
      : await payload.find({
          collection: 'declarations',
          where: { id: { in: declarationIds } },
          select: { cuttingTypeCode: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
        })
  const codes = new Map(declarations.map((d) => [d.id, d.cuttingTypeCode ?? null]))
  const names = new Map(areas.map((a) => [a.id, a.name]))

  const groups: AlertFeedGroup[] = []
  for (const alert of shown) {
    const snapshot = alertSnapshot(alert)
    const declarationId = relationId(alert.declaration)
    const watchArea = relationId(alert.watchArea)
    const type = cuttingType(codes.get(declarationId))
    const createdAt = new Date(alert.createdAt)
    const day = DAY_KEY.format(createdAt)
    const item: AlertFeedItem = {
      id: alert.id,
      changeType: alert.changeType,
      unread: !alert.readAt,
      watchArea: { id: watchArea, name: names.get(watchArea) ?? '' },
      declarationId,
      cuttingTypeLabel: type.known ? type.label_fi : (snapshot.cuttingTypeLabel ?? type.label_fi),
      colourToken: type.colourToken,
      areaHa: snapshot.areaHa,
      distanceM: snapshot.distanceM,
      time: TIME.format(createdAt),
    }
    const group = groups.at(-1)
    if (group?.day === day) group.items.push(item)
    else groups.push({ day, label: DAY_LABEL.format(createdAt), items: [item] })
  }

  return {
    groups,
    nextCursor:
      alerts.length > ALERT_FEED_PAGE_SIZE && last
        ? encodeAlertFeedCursor({ createdAt: last.createdAt, id: last.id })
        : null,
    watchAreas: areas.map((a) => ({ id: a.id, name: a.name })),
    watchAreaId,
    unreadCount,
  }
}
