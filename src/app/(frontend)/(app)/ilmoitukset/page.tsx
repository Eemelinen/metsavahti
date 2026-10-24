import type { Metadata } from 'next'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fi } from '@/i18n/fi'
import { loadAlertFeed } from '@/lib/alerts/feed'
import { parseAlertFeedQuery } from '@/lib/alerts/feed-query'
import { requireUser } from '@/lib/auth/guards'

import { AlertFeed } from './alert-feed'

export const metadata: Metadata = { title: fi.alerts.feed.title }
export const dynamic = 'force-dynamic'

/**
 * `/ilmoitukset` (E07 MV-080, App artboard `ilmoitukset`): the account's alerts across all
 * watch areas, newest first, 50 per page (`?ennen=` cursor), grouped by the Finnish day, with
 * the watch-area filter (`?alue=`), unread styling, "Merkitse kaikki luetuiksi" and the empty
 * state. `removed` alerts show only while `ALERT_ON_REMOVED=1`. A bad `?alue=` or `?ennen=`
 * is ignored, so the page falls back to the first page of every area.
 */
export default async function IlmoituksetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser({ next: '/ilmoitukset' })
  const query = parseAlertFeedQuery(await searchParams)
  const feed = await loadAlertFeed(await getPayload({ config }), user, query)
  return <AlertFeed feed={feed} paged={query.cursor !== null} />
}
