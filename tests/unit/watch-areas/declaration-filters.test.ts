import { describe, expect, it } from 'vitest'

import {
  type DeclarationFilters,
  declarationFilterQuery,
  filterDeclarations,
  parseDeclarationFilters,
} from '@/lib/watch-areas/declaration-filters'
import type { WatchAreaDeclarationProperties } from '@/lib/watch-areas/detail'
import { watchAreaIdParam } from '@/lib/watch-areas/watch-area-schema'

const NONE: DeclarationFilters = { type: null, onlyNew: false, from: null, to: null }

function row(
  id: number,
  overrides: Partial<WatchAreaDeclarationProperties>,
): { id: number; properties: WatchAreaDeclarationProperties } {
  return {
    id,
    properties: {
      sourceId: `forestusedeclaration.${id}`,
      declarationNumber: `1-2026-${id}`,
      cuttingTypeCode: 4,
      cuttingTypeLabel: null,
      areaHa: 1,
      receivedAt: '2026-10-01T09:00:00.000Z',
      validUntil: '2029-10-01T09:00:00.000Z',
      distanceM: 0,
      isNew: false,
      ...overrides,
    },
  }
}

/** Kaistalehakkuu (uudistus), Harvennushakkuu (harvennus), an unknown code (muu), no date. */
const ROWS = [
  row(1, { cuttingTypeCode: 4, isNew: true, receivedAt: '2026-10-01T09:00:00.000Z' }),
  // 21.30 UTC on 30.9. is already 1.10. in Finland.
  row(2, { cuttingTypeCode: 3, receivedAt: '2026-09-30T21:30:00.000Z' }),
  row(3, { cuttingTypeCode: null, receivedAt: '2026-08-15T09:00:00.000Z' }),
  row(4, { cuttingTypeCode: 3, isNew: true, receivedAt: null }),
]

const ids = (filters: Partial<DeclarationFilters>) =>
  filterDeclarations(ROWS, { ...NONE, ...filters }).map((r) => r.id)

/** MV-067: the list filters of `/vahtialueet/[id]`, kept in the search params. */
describe('declaration filters (MV-067)', () => {
  it('reads the search params and ignores values it does not know', () => {
    expect(parseDeclarationFilters({})).toEqual(NONE)
    expect(
      parseDeclarationFilters({
        tyyppi: 'harvennus',
        uudet: '1',
        alkaen: '2026-09-01',
        asti: '2026-10-31',
      }),
    ).toEqual({ type: 'harvennus', onlyNew: true, from: '2026-09-01', to: '2026-10-31' })
    expect(
      parseDeclarationFilters({
        tyyppi: 'avohakkuu',
        uudet: 'kyllä',
        alkaen: '1.9.2026',
        asti: '2026-02-30',
      }),
    ).toEqual(NONE)
    // A repeated parameter counts once, by its first value.
    expect(parseDeclarationFilters({ tyyppi: ['muu', 'uudistus'] }).type).toBe('muu')
  })

  it('writes the filters back as the same search params', () => {
    expect(declarationFilterQuery(NONE)).toBe('')
    const filters: DeclarationFilters = {
      type: 'uudistus',
      onlyNew: true,
      from: '2026-09-01',
      to: null,
    }
    const query = declarationFilterQuery(filters)
    expect(query).toBe('?tyyppi=uudistus&uudet=1&alkaen=2026-09-01')
    expect(parseDeclarationFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(filters)
  })

  it('filters by harvest-type group, unread alert and Finnish received day', () => {
    expect(ids({})).toEqual([1, 2, 3, 4])
    expect(ids({ type: 'uudistus' })).toEqual([1])
    expect(ids({ type: 'harvennus' })).toEqual([2, 4])
    expect(ids({ type: 'muu' })).toEqual([3])
    expect(ids({ onlyNew: true })).toEqual([1, 4])
    expect(ids({ type: 'harvennus', onlyNew: true })).toEqual([4])
    // Both bounds are inclusive; a declaration without a date never matches a date bound.
    expect(ids({ from: '2026-10-01' })).toEqual([1, 2])
    expect(ids({ to: '2026-09-30' })).toEqual([3])
    expect(ids({ from: '2026-08-15', to: '2026-08-15' })).toEqual([3])
  })

  it('accepts only a plain positive id from the route', () => {
    expect(watchAreaIdParam('42')).toBe(42)
    for (const bad of ['0', '01', '-1', '1.5', 'abc', '1e3', '1234567890']) {
      expect(watchAreaIdParam(bad)).toBeNull()
    }
  })
})
