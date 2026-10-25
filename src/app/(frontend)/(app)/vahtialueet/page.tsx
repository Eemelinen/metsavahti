import type { FeatureCollection, Polygon } from 'geojson'
import { TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import config from '@payload-config'
import { MapView } from '@/components/map/map-view'
import { Button } from '@/components/ui/button'
import { fi } from '@/i18n/fi'
import { formatSessionTime } from '@/lib/account/sessions'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { requireUser } from '@/lib/auth/guards'
import { previewCircle } from '@/lib/geo/buffer'
import { loadReacceptance } from '@/lib/legal/reacceptance'
import { mapSources } from '@/lib/map-sources'
import { formatRadius, loadWatchAreaDashboard } from '@/lib/watch-areas/dashboard'

import { ReacceptanceBanner } from '../reacceptance-banner'
import { NewWatchAreaButton } from './new-watch-area-button'
import { type WatchAreaCard, WatchAreaCards } from './watch-area-cards'

const copy = fi.watchAreas.dashboard

export const metadata: Metadata = { title: copy.title }
export const dynamic = 'force-dynamic'

/**
 * `/vahtialueet` (E05 MV-066, App artboard `vahtialueet`): the account's watch areas as cards
 * (address and radius, declarations in force, "Uusia: N", last check, e-mail switch, kebab with
 * edit / delete), an overview map of every area, "Uusi vahtialue" (disabled with a tooltip at
 * the plan limit) and the "Tiedot päivitetty" strip from the latest succeeded `pipeline` run,
 * with a warning once that run is stale (MV-083), and above the heading `ReacceptanceBanner` while
 * the account has not accepted the current terms / privacy versions (MV-086). Without areas the
 * page shows the empty state instead of the cards and the map.
 */
export default async function WatchAreasPage() {
  const user = await requireUser({ next: '/vahtialueet' })
  const payload = await getPayload({ config })
  const [{ areas, maxWatchAreas, dataUpdatedAt, dataStale }, reacceptance] = await Promise.all([
    loadWatchAreaDashboard(payload, user),
    loadReacceptance(payload, user),
  ])
  const timeZone = user.timezone ?? DEFAULT_TIMEZONE

  const cards: WatchAreaCard[] = areas.map((a) => ({
    id: a.id,
    name: a.name,
    place: copy.place(a.addressLabel, formatRadius(a.radiusM)),
    activeCount: a.activeCount,
    newCount: a.newCount,
    checked: a.lastCheckedAt
      ? copy.checked(formatSessionTime(a.lastCheckedAt, timeZone))
      : copy.notChecked,
    notificationsEnabled: a.notificationsEnabled,
  }))

  const areaCircles: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: areas.map((a) => ({
      ...previewCircle(a.center, a.radiusM),
      id: a.id,
      properties: { name: a.name },
    })),
  }

  return (
    <div className="flex w-full max-w-275 flex-col gap-5">
      {reacceptance && <ReacceptanceBanner reacceptance={reacceptance} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-forest-700">{copy.title}</h1>
          <p className="mt-1 text-sm text-ink-muted" data-testid="data-status">
            {dataUpdatedAt
              ? copy.dataUpdated(formatSessionTime(dataUpdatedAt, timeZone))
              : copy.dataNotUpdated}
          </p>
          {dataStale && (
            <p
              className="mt-1 flex items-start gap-1.5 text-sm font-medium text-amber-700"
              data-testid="data-stale"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {copy.dataStale}
            </p>
          )}
        </div>
        <NewWatchAreaButton
          limitReached={areas.length >= maxWatchAreas}
          limitText={copy.limitReached(maxWatchAreas)}
        />
      </div>

      {areas.length === 0 ? (
        <section
          aria-labelledby="no-watch-areas-title"
          className="flex flex-col items-center gap-3.5 rounded-2xl border border-dashed border-sage-300 bg-paper-raised px-6 py-12 text-center"
          data-testid="no-watch-areas"
        >
          <h2 className="text-xl font-bold text-forest-700" id="no-watch-areas-title">
            {copy.emptyTitle}
          </h2>
          <p className="max-w-95 text-ink-muted">{copy.emptyBody}</p>
          <Button asChild size="xl">
            <Link href="/aloita">{copy.emptyAction}</Link>
          </Button>
        </section>
      ) : (
        <>
          <WatchAreaCards areas={cards} />
          <section aria-labelledby="overview-title" className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-forest-700" id="overview-title">
              {copy.overview}
            </h2>
            <MapView
              center={areas[0]!.center}
              sources={mapSources()}
              watchAreaGeoJSON={areaCircles}
            />
          </section>
        </>
      )}
    </div>
  )
}
