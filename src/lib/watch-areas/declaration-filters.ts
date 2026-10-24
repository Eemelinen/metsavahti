import { z } from 'zod'

import type { CuttingColourToken } from '@/config/cutting-types'
import { cuttingColourToken } from '@/lib/wfs/codes'
import type { WatchAreaDeclarationProperties } from '@/lib/watch-areas/detail'

/*
 * The list filters of `/vahtialueet/[id]` (E05 MV-067), kept in the URL so a filtered view can
 * be reloaded and shared. Browser-safe: the page filters on the server and its filter buttons
 * build the next URL in the browser with the same functions.
 */

/** The list filters of `/vahtialueet/[id]` (`03-pages.md`: type, only new, date range). */
export type DeclarationFilters = {
  /** Harvest-type group of the map colours and the legend. */
  type: CuttingColourToken | null
  onlyNew: boolean
  /** Received on or after this Finnish calendar day (`YYYY-MM-DD`). */
  from: string | null
  /** Received on or before this Finnish calendar day (`YYYY-MM-DD`). */
  to: string | null
}

export const DECLARATION_TYPE_FILTERS = [
  'uudistus',
  'harvennus',
  'muu',
] as const satisfies readonly CuttingColourToken[]

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)

/** The page's search params (`?tyyppi=&uudet=1&alkaen=&asti=`); a bad value is ignored. */
const filterParamsSchema = z.object({
  tyyppi: z.preprocess(one, z.enum(DECLARATION_TYPE_FILTERS).nullable().catch(null)),
  uudet: z.preprocess(one, z.literal('1').nullable().catch(null)),
  alkaen: z.preprocess(one, z.iso.date().nullable().catch(null)),
  asti: z.preprocess(one, z.iso.date().nullable().catch(null)),
})

export function parseDeclarationFilters(
  searchParams: Record<string, string | string[] | undefined>,
): DeclarationFilters {
  const p = filterParamsSchema.parse(searchParams)
  return { type: p.tyyppi, onlyNew: p.uudet === '1', from: p.alkaen, to: p.asti }
}

/** `?tyyppi=…` for the filters (empty string when none are set), the inverse of the parse. */
export function declarationFilterQuery(filters: DeclarationFilters): string {
  const params = new URLSearchParams()
  if (filters.type) params.set('tyyppi', filters.type)
  if (filters.onlyNew) params.set('uudet', '1')
  if (filters.from) params.set('alkaen', filters.from)
  if (filters.to) params.set('asti', filters.to)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** `YYYY-MM-DD` of an instant in Finland, the day the list shows as "saapunut". */
const FINNISH_DAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' })

/** The features the filters let through; a date bound drops declarations without a date. */
export function filterDeclarations<T extends { properties: WatchAreaDeclarationProperties }>(
  features: readonly T[],
  filters: DeclarationFilters,
): T[] {
  return features.filter(({ properties: p }) => {
    if (filters.type && cuttingColourToken(p.cuttingTypeCode) !== filters.type) return false
    if (filters.onlyNew && !p.isNew) return false
    if (filters.from || filters.to) {
      if (!p.receivedAt) return false
      const day = FINNISH_DAY.format(new Date(p.receivedAt))
      if (filters.from && day < filters.from) return false
      if (filters.to && day > filters.to) return false
    }
    return true
  })
}
