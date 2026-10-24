import { cn } from 'cn'
import Link from 'next/link'
import { type KeyboardEvent, useId } from 'react'

import type { CuttingColourToken } from '@/config/cutting-types'
import type { DeclarationMapProperties } from '@/lib/geo/spatial-queries'
import { cuttingType } from '@/lib/wfs/codes'

/** A declaration on the map: `declarationsForWatchArea()` properties, plus where its details live. */
export type MapDeclarationProperties = DeclarationMapProperties & {
  /** Target of "Näytä tiedot"; the page that renders the map decides it (left out: no link). */
  detailHref?: string
}

export type MapDeclaration = { id: number | string; properties: MapDeclarationProperties }

const CHIP_DOT: Record<CuttingColourToken, string> = {
  uudistus: 'bg-cut-uudistus',
  harvennus: 'bg-cut-harvennus',
  muu: 'bg-cut-muu',
}

const HA_FORMAT = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 1 })
const KM_FORMAT = new Intl.NumberFormat('fi-FI', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const DATE_FORMAT = new Intl.DateTimeFormat('fi-FI', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'Europe/Helsinki',
})

/** "1,2 ha" (artboard `alue`); "– ha" when the source left the area out. */
export function formatAreaHa(areaHa: number | null): string {
  return `${areaHa == null ? '–' : HA_FORMAT.format(areaHa)} ha`
}

/** Metres under a kilometre, otherwise kilometres with one decimal (artboard `fmtDist`). */
export function formatDistance(distanceM: number): string {
  return distanceM >= 1000
    ? `${KM_FORMAT.format(distanceM / 1000)} km`
    : `${Math.round(distanceM)} m`
}

/** "24.10.2026" in Finnish time; "–" when the declaration has no received date. */
export function formatReceived(receivedAt: string | null): string {
  return receivedAt ? DATE_FORMAT.format(new Date(receivedAt)) : '–'
}

/** The plain-Finnish cutting type with its map colour (MV-061's "cutting type chip"). */
export function CuttingTypeChip({ code }: { code: number | null }) {
  const type = cuttingType(code)
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-0.5 text-sm font-semibold text-ink"
      data-colour={type.colourToken}
    >
      <span
        aria-hidden="true"
        className={cn('size-2.5 shrink-0 rounded-xs', CHIP_DOT[type.colourToken])}
      />
      {type.label_fi}
    </span>
  )
}

/** "1,2 ha · 350 m keskipisteestä" and "Ilmoitus saapunut 1.10.2026" (artboard `alue`). */
export function DeclarationFacts({ properties }: { properties: MapDeclarationProperties }) {
  return (
    <>
      <p className="text-ink-muted">
        {formatAreaHa(properties.areaHa)} · {formatDistance(properties.distanceM)} keskipisteestä
      </p>
      <p className="text-ink-muted">Ilmoitus saapunut {formatReceived(properties.receivedAt)}</p>
    </>
  )
}

const DETAIL_LINK =
  'inline-flex min-h-9 items-center justify-center rounded-lg bg-forest-700 px-3 py-2 text-sm font-semibold text-paper-raised outline-none hover:bg-forest-600 focus-visible:ring-3 focus-visible:ring-ring/50'

/** "Näytä tiedot" of a declaration; nothing when the page gave no `detailHref`. */
export function DeclarationDetailLink({
  properties,
  className,
}: {
  properties: MapDeclarationProperties
  className?: string
}) {
  if (!properties.detailHref) return null
  return (
    <Link
      aria-label={`Näytä tiedot: ${cuttingType(properties.cuttingTypeCode).label_fi}, ${formatAreaHa(properties.areaHa)}`}
      className={cn(DETAIL_LINK, className)}
      href={properties.detailHref}
    >
      Näytä tiedot
    </Link>
  )
}

/**
 * The card a clicked declaration polygon opens (MV-061, App artboard `alue`): cutting type
 * chip, area, distance from the watch-area centre, received date and "Näytä tiedot". Sits in
 * the map's bottom-right corner like the artboard's card; "Sulje" and Escape close it.
 */
export function DeclarationPopover({
  declaration,
  onClose,
  className,
}: {
  declaration: MapDeclaration
  onClose: () => void
  className?: string
}) {
  const titleId = useId()
  const { properties } = declaration

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose()
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'flex flex-col gap-1.5 rounded-xl bg-paper-raised p-3.5 text-sm shadow-pop',
        className,
      )}
      data-testid="declaration-popover"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0" id={titleId}>
          <span className="sr-only">Metsänkäyttöilmoitus: </span>
          <CuttingTypeChip code={properties.cuttingTypeCode} />
        </h2>
        <button
          aria-label="Sulje"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-base text-ink-muted outline-none hover:bg-paper-sunken focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <DeclarationFacts properties={properties} />
      <DeclarationDetailLink className="mt-1" properties={properties} />
    </section>
  )
}
