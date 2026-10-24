'use client'

import { cn } from 'cn'
import type { FeatureCollection, MultiPolygon } from 'geojson'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useRef, useState, useTransition } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import {
  formatAreaHa,
  formatDistance,
  formatReceived,
  type MapDeclaration,
  type MapDeclarationProperties,
} from '@/components/map/declaration-popover'
import { MAP_LEGEND } from '@/components/map/map-legend'
import { MapView } from '@/components/map/map-view'
import type { CuttingColourToken } from '@/config/cutting-types'
import { fi } from '@/i18n/fi'
import type { LonLat } from '@/lib/geo/crs'
import type { MapSources } from '@/lib/map-sources'
import {
  type DeclarationFilters,
  declarationFilterQuery,
} from '@/lib/watch-areas/declaration-filters'
import type { WatchAreaDeclarationProperties } from '@/lib/watch-areas/detail'
import { cuttingType } from '@/lib/wfs/codes'

import { deleteWatchArea } from '../actions'

const copy = fi.watchAreas.detail
const dashboardCopy = fi.watchAreas.dashboard

type Properties = WatchAreaDeclarationProperties & MapDeclarationProperties

const COLOUR: Record<CuttingColourToken, string> = {
  uudistus: 'bg-cut-uudistus',
  harvennus: 'bg-cut-harvennus',
  muu: 'bg-cut-muu',
}

const ACTION =
  'inline-flex min-h-10 items-center rounded-lg border border-line bg-paper-raised px-3.5 py-2 text-sm font-semibold outline-none hover:border-line-strong focus-visible:ring-3 focus-visible:ring-ring/50'

const PILL =
  'inline-flex min-h-9.5 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

/**
 * The interactive part of `/vahtialueet/[id]` (App artboard `alue`): the map, the header with
 * the actions, the filters and the declaration list. The server page has already applied the
 * filters; a filter button replaces the search params and the page renders again. A polygon
 * click selects its row (opens it, so the popover's "Näytä tiedot" lands on the details) and
 * a row's "Näytä kartalla" selects its polygon. Delete asks first and returns to
 * `/vahtialueet`. `data-hydrated` tells the e2e tests when a click is no longer lost.
 */
export function WatchAreaDetail({
  area,
  sources,
  declarations,
  filters,
  totalCount,
  unreadCount,
  created,
}: {
  area: { id: number; name: string; summary: string; center: LonLat; radiusM: number }
  sources: MapSources
  /** The rows the filters let through, newest first. */
  declarations: FeatureCollection<MultiPolygon, Properties>
  filters: DeclarationFilters
  /** Declarations of the area before filtering. */
  totalCount: number
  /** Declarations with an unread alert, before filtering. */
  unreadCount: number
  created: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const hydrated = useHydrated()
  const mapRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<MapDeclaration['id'] | null>(null)
  const [openId, setOpenId] = useState<MapDeclaration['id'] | null>(null)
  const [filtering, startFiltering] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [deleting, startDelete] = useTransition()
  const [failed, setFailed] = useState(false)

  const rows = declarations.features
  const filtered =
    filters.type !== null || filters.onlyNew || filters.from !== null || filters.to !== null

  function applyFilters(next: Partial<DeclarationFilters>) {
    startFiltering(() =>
      router.replace(`${pathname}${declarationFilterQuery({ ...filters, ...next })}`, {
        scroll: false,
      }),
    )
  }

  function selectOnMap(id: MapDeclaration['id'] | null) {
    setSelectedId(id)
    if (id !== null) setOpenId(id)
  }

  function showOnMap(id: MapDeclaration['id']) {
    setSelectedId(id)
    mapRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  function remove() {
    startDelete(async () => {
      setFailed(false)
      const result = await deleteWatchArea(area.id).catch(() => null)
      if (!result?.ok) {
        setConfirming(false)
        setFailed(true)
        return
      }
      router.push('/vahtialueet')
    })
  }

  return (
    <div
      className="flex w-full flex-col gap-5 lg:flex-row lg:items-start"
      data-hydrated={hydrated ? '' : undefined}
      data-testid="watch-area-detail"
    >
      <section
        aria-label="Vahtialueen kartta"
        className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:flex-1"
        ref={mapRef}
      >
        <Link
          className="self-start rounded-sm text-sm font-semibold text-forest-700 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/vahtialueet"
        >
          {copy.back}
        </Link>
        <MapView
          center={area.center}
          className="h-map-detail"
          declarationList={false}
          declarationsGeoJSON={declarations}
          onSelectedDeclarationChange={selectOnMap}
          radiusM={area.radiusM}
          selectedDeclarationId={selectedId}
          sources={sources}
        />
      </section>

      <div className="flex min-w-0 flex-col gap-4 lg:w-100 lg:flex-none">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-2xl font-bold text-forest-700">{area.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">{area.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className={cn(ACTION, 'text-forest-700')}
              href={`/vahtialueet/${area.id}/muokkaa`}
            >
              {copy.edit}
            </Link>
            <Link className={cn(ACTION, 'text-forest-700')} href="/tili/ilmoitukset">
              {copy.notifications}
            </Link>
            <button
              className={cn(ACTION, 'cursor-pointer text-ember-700 hover:border-ember-500')}
              onClick={() => setConfirming(true)}
              type="button"
            >
              {copy.remove}
            </button>
          </div>
        </div>

        {created ? <FormSuccess>{copy.created}</FormSuccess> : null}
        {failed ? <FormError>{dashboardCopy.failed}</FormError> : null}

        <div aria-label={copy.filters} className="flex flex-col gap-3" role="group">
          <div className="flex flex-wrap gap-2">
            <FilterPill on={filters.type === null} onClick={() => applyFilters({ type: null })}>
              {copy.allTypes}
            </FilterPill>
            {MAP_LEGEND.map(({ token, label }) => (
              <FilterPill
                key={token}
                on={filters.type === token}
                onClick={() => applyFilters({ type: token })}
              >
                <span aria-hidden="true" className={cn('size-2 rounded-xs', COLOUR[token])} />
                {label}
              </FilterPill>
            ))}
            <button
              aria-pressed={filters.onlyNew}
              className={cn(
                PILL,
                filters.onlyNew
                  ? 'border-amber-700 bg-amber-700 text-white'
                  : 'border-line bg-paper-raised text-ink hover:border-line-strong',
              )}
              onClick={() => applyFilters({ onlyNew: !filters.onlyNew })}
              type="button"
            >
              {copy.onlyNew}
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <DateFilter
              label={copy.receivedFrom}
              name="alkaen"
              onChange={(from) => applyFilters({ from })}
              value={filters.from}
            />
            <DateFilter
              label={copy.receivedTo}
              name="asti"
              onChange={(to) => applyFilters({ to })}
              value={filters.to}
            />
            {filtered ? (
              <Link
                className="min-h-10 rounded-sm py-2 text-sm font-semibold text-forest-700 underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                href={pathname}
                replace
                scroll={false}
              >
                {copy.clearFilters}
              </Link>
            ) : null}
          </div>
        </div>

        <p aria-live="polite" className="text-sm text-ink-muted" data-testid="declaration-count">
          {copy.count(rows.length, unreadCount)}
        </p>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sage-300 bg-paper-raised px-5 py-8 text-center text-ink-muted">
            {totalCount === 0 ? copy.noDeclarations : copy.noMatches}
          </p>
        ) : (
          <ul
            aria-busy={filtering}
            aria-label={copy.listLabel}
            className={cn('flex flex-col gap-2.5', filtering && 'opacity-60')}
            data-testid="declaration-rows"
          >
            {rows.map((row) => (
              <DeclarationRow
                key={row.id}
                onShowOnMap={() => showOnMap(row.id!)}
                onToggle={() => setOpenId((id) => (id === row.id ? null : row.id!))}
                open={openId === row.id}
                row={{ id: row.id!, properties: row.properties }}
                selected={selectedId === row.id}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        cancelLabel={dashboardCopy.cancel}
        confirmLabel={dashboardCopy.confirmOk}
        description={dashboardCopy.confirmBody(area.name)}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
        open={confirming}
        pending={deleting}
        title={dashboardCopy.confirmTitle}
      />
    </div>
  )
}

function FilterPill({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      aria-pressed={on}
      className={cn(
        PILL,
        on
          ? 'border-forest-700 bg-forest-700 text-white'
          : 'border-line bg-paper-raised text-ink hover:border-line-strong',
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function DateFilter({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-10 rounded-lg border border-line-strong bg-paper-raised px-3 py-2 text-sm font-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        // A new value from the server (a filter link, "Tyhjennä") resets the field.
        defaultValue={value ?? ''}
        key={value ?? ''}
        name={name}
        onChange={(e) => {
          if (e.target.value === '' || e.target.validity.valid) onChange(e.target.value || null)
        }}
        type="date"
      />
    </label>
  )
}

function DeclarationRow({
  row,
  open,
  selected,
  onToggle,
  onShowOnMap,
}: {
  row: { id: MapDeclaration['id']; properties: Properties }
  open: boolean
  selected: boolean
  onToggle: () => void
  onShowOnMap: () => void
}) {
  const p = row.properties
  const type = cuttingType(p.cuttingTypeCode)
  const detailsId = `ilmoitus-${row.id}-tiedot`
  const a = copy.attributes

  return (
    <li
      className={cn(
        'scroll-mt-6 overflow-hidden rounded-xl border bg-paper-raised',
        selected ? 'border-forest-700' : 'border-line',
      )}
      data-testid="declaration-row"
      id={`ilmoitus-${row.id}`}
    >
      <button
        aria-controls={detailsId}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left outline-none hover:bg-paper focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        onClick={onToggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn('h-9 w-3 flex-none rounded-sm', COLOUR[type.colourToken])}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-base text-ink">{type.label_fi}</strong>
            {p.isNew ? (
              <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs font-semibold text-white">
                {copy.newBadge}
              </span>
            ) : null}
          </span>
          <span className="text-sm text-ink-muted">
            {formatAreaHa(p.areaHa)} · {formatDistance(p.distanceM)} ·{' '}
            {copy.received(formatReceived(p.receivedAt))}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn('flex-none text-ink-muted transition-transform', open && 'rotate-180')}
        >
          ⌄
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-4 pb-4 sm:pl-10" id={detailsId}>
          <dl className="grid grid-cols-attributes gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-muted">{a.cuttingType}</dt>
            <dd>
              {type.label_fi}
              <span className="block text-ink-muted">{type.explanation_fi}</span>
            </dd>
            <dt className="text-ink-muted">{a.declarationNumber}</dt>
            <dd>{p.declarationNumber}</dd>
            <dt className="text-ink-muted">{a.area}</dt>
            <dd>{formatAreaHa(p.areaHa)}</dd>
            <dt className="text-ink-muted">{a.distance}</dt>
            <dd>{a.distanceValue(formatDistance(p.distanceM))}</dd>
            <dt className="text-ink-muted">{a.received}</dt>
            <dd>{formatReceived(p.receivedAt)}</dd>
            <dt className="text-ink-muted">{a.validUntil}</dt>
            <dd>{p.validUntil ? a.validUntilValue(formatReceived(p.validUntil)) : '–'}</dd>
          </dl>
          <p className="rounded-md bg-paper px-3 py-2.5 text-sm text-ink-muted">
            {copy.disclaimer}
          </p>
          <div>
            <button
              aria-pressed={selected}
              className={cn(
                ACTION,
                'cursor-pointer text-forest-700 aria-pressed:border-forest-700',
              )}
              onClick={onShowOnMap}
              type="button"
            >
              {copy.showOnMap}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
