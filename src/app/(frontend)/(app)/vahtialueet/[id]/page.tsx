import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fi } from '@/i18n/fi'
import { formatSessionTime } from '@/lib/account/sessions'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { requireUser } from '@/lib/auth/guards'
import { Forbidden, NotFound } from '@/lib/errors'
import { mapSources } from '@/lib/map-sources'
import { formatRadius } from '@/lib/watch-areas/dashboard'
import {
  declarationFilterQuery,
  filterDeclarations,
  parseDeclarationFilters,
} from '@/lib/watch-areas/declaration-filters'
import { loadWatchAreaDetail } from '@/lib/watch-areas/detail'
import { watchAreaIdParam } from '@/lib/watch-areas/watch-area-schema'

import { WatchAreaDetail } from './watch-area-detail'

const copy = fi.watchAreas.detail

export const metadata: Metadata = { title: 'Vahtialue' }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

/**
 * `/vahtialueet/[id]` (E05 MV-067, App artboard `alue`): the area's map with its declarations
 * in force, the declaration list with filters (type, only new, received date range; kept in
 * the search params and applied here, so the map and the list show the same rows), expandable
 * rows with the attributes in Finnish and the "intention" disclaimer, and the actions edit,
 * notification settings and delete. Someone else's area, or an id that does not exist, is a
 * 404 (the JSON endpoint answers 403 / 404 for them).
 */
export default async function WatchAreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { id: idParam } = await params
  const user = await requireUser({ next: `/vahtialueet/${idParam}` })
  const id = watchAreaIdParam(idParam)
  if (id === null) notFound()

  const detail = await loadWatchAreaDetail(await getPayload({ config }), user, id).catch(
    (error: unknown) => {
      if (error instanceof NotFound || error instanceof Forbidden) notFound()
      throw error
    },
  )
  const query = await searchParams
  const filters = parseDeclarationFilters(query)
  const { area, declarations } = detail
  const all = declarations.features
  const shown = filterDeclarations(all, filters)
  const pagePath = `/vahtialueet/${area.id}${declarationFilterQuery(filters)}`

  return (
    <WatchAreaDetail
      area={{
        id: area.id,
        name: area.name,
        center: area.center,
        radiusM: area.radiusM,
        summary: copy.summary(
          fi.watchAreas.dashboard.place(area.addressLabel, formatRadius(area.radiusM)),
          area.lastCheckedAt
            ? copy.checked(formatSessionTime(area.lastCheckedAt, user.timezone ?? DEFAULT_TIMEZONE))
            : copy.notChecked,
        ),
      }}
      created={query.created === '1'}
      declarations={{
        type: 'FeatureCollection',
        features: shown.map((f) => ({
          ...f,
          // The popover's "Näytä tiedot" scrolls to the declaration's row in the list.
          properties: { ...f.properties, detailHref: `${pagePath}#ilmoitus-${f.id}` },
        })),
      }}
      filters={filters}
      sources={mapSources()}
      totalCount={all.length}
      unreadCount={all.filter((f) => f.properties.isNew).length}
    />
  )
}
