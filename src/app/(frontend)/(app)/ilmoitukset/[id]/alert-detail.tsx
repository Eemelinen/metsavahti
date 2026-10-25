'use client'

import { cn } from 'cn'
import Link from 'next/link'
import { useEffect } from 'react'

import { ChangeTypeTag } from '@/components/alerts/alert-item'
import { useHydrated } from '@/components/forms/use-hydrated'
import { formatAreaHa, formatDistance, formatReceived } from '@/components/map/declaration-popover'
import { MapView } from '@/components/map/map-view'
import type { CuttingColourToken } from '@/config/cutting-types'
import { wfs } from '@/config/wfs'
import { fi } from '@/i18n/fi'
import type { AlertDetail as AlertDetailData, AlertDetailChange } from '@/lib/alerts/detail'
import type { MapSources } from '@/lib/map-sources'
import { cuttingType } from '@/lib/wfs/codes'

import { markAlertRead } from '../actions'

const copy = fi.alerts.detail
const a = copy.attributes

const COLOUR: Record<CuttingColourToken, string> = {
  uudistus: 'bg-cut-uudistus',
  harvennus: 'bg-cut-harvennus',
  muu: 'bg-cut-muu',
}

const ACTION =
  'inline-flex min-h-11 items-center rounded-lg px-4.5 py-3 text-base font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

function changeValue(change: AlertDetailChange): string {
  if (change.field === 'cuttingType') return change.now
  if (change.field === 'areaHa') return formatAreaHa(change.now)
  return formatReceived(change.now)
}

/**
 * The browser part of `/ilmoitukset/[id]` (App artboard `ilmoitus`): the map on the left (on
 * top on narrow screens), the facts on the right. An unread alert is marked read once the page
 * is on screen; the action refreshes the router, so the nav badge follows without a reload.
 * The header and the facts are the snapshot's (what the alert said); the cutting type's colour,
 * label and explanation follow the declaration's current code, as in the feed.
 */
export function AlertDetail({ alert, sources }: { alert: AlertDetailData; sources: MapSources }) {
  const hydrated = useHydrated()
  const type = cuttingType(alert.cuttingTypeCode)
  const { snapshot, updated } = alert

  useEffect(() => {
    // A failed stamp leaves the alert unread; the page itself still works.
    if (alert.unread) void markAlertRead(alert.id).catch(() => null)
  }, [alert.id, alert.unread])

  return (
    <div
      className="flex w-full flex-col gap-5 lg:flex-row lg:items-start"
      data-hydrated={hydrated ? '' : undefined}
      data-testid="alert-detail"
    >
      <section
        aria-label={copy.mapLabel}
        className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:flex-1"
      >
        <Link
          className="self-start rounded-sm text-sm font-semibold text-forest-700 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          href="/ilmoitukset"
        >
          {copy.back}
        </Link>
        <MapView
          center={alert.watchArea.center}
          className="h-map-detail"
          declarationList={false}
          declarationsGeoJSON={
            alert.declaration
              ? { type: 'FeatureCollection', features: [alert.declaration] }
              : undefined
          }
          fit="declarations"
          radiusM={alert.watchArea.radiusM}
          sources={sources}
        />
      </section>

      <div className="flex min-w-0 flex-col gap-4 lg:w-100 lg:flex-none">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn('size-3.5 flex-none rounded-xs', COLOUR[type.colourToken])}
          />
          <span className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            {type.known ? type.label_fi : (snapshot.cuttingTypeLabel ?? type.label_fi)}
          </span>
          <ChangeTypeTag type={alert.changeType} />
        </div>
        <h1 className="text-2xl font-bold text-balance text-forest-700">
          {copy.title(
            formatAreaHa(snapshot.areaHa),
            formatDistance(snapshot.distanceM),
            alert.watchArea.name,
          )}
        </h1>
        {alert.changeType === 'new' ? null : (
          <p className="text-sm text-ink-muted">
            {fi.alerts.changeType[alert.changeType].explanation}
          </p>
        )}

        <dl
          className="grid grid-cols-attributes gap-x-4 gap-y-2 rounded-xl border border-line bg-paper-raised p-4 text-base"
          data-testid="alert-attributes"
        >
          <dt className="text-ink-muted">{a.received}</dt>
          <dd>{formatReceived(snapshot.receivedAt)}</dd>
          <dt className="text-ink-muted">{a.cuttingType}</dt>
          <dd>{snapshot.cuttingTypeLabel ?? type.label_fi}</dd>
          <dt className="text-ink-muted">{a.area}</dt>
          <dd>{formatAreaHa(snapshot.areaHa)}</dd>
          <dt className="text-ink-muted">{a.distance}</dt>
          <dd>{a.distanceValue(formatDistance(snapshot.distanceM))}</dd>
          {alert.declarationNumber ? (
            <>
              <dt className="text-ink-muted">{a.declarationNumber}</dt>
              <dd>{alert.declarationNumber}</dd>
            </>
          ) : null}
          <dt className="text-ink-muted">{a.validUntil}</dt>
          <dd>
            {alert.validUntil
              ? a.validUntilValue(formatReceived(alert.validUntil))
              : a.validUntilDefault}
          </dd>
          <dt className="text-ink-muted">{a.earliest}</dt>
          <dd>{a.earliestValue}</dd>
        </dl>

        {updated ? (
          <div
            className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-100 p-4 text-sm text-ink"
            data-testid="alert-updated"
            role="note"
          >
            <h2 className="text-base font-semibold">{copy.updatedTitle}</h2>
            <p>{updated.removed ? copy.removedBody : copy.updatedBody}</p>
            {updated.changes.length > 0 ? (
              <dl className="grid grid-cols-attributes gap-x-4 gap-y-1">
                {updated.changes.map((change) => (
                  <div className="contents" key={change.field}>
                    <dt className="text-ink-muted">{copy.changeLabel[change.field]}</dt>
                    <dd>{changeValue(change)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}

        <details className="rounded-xl bg-forest-50 px-4 py-3.5 text-forest-700">
          <summary className="cursor-pointer rounded-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {copy.explainerTitle}
          </summary>
          <div className="mt-2.5 flex flex-col gap-2 text-sm text-pretty">
            <p>
              <strong>{type.label_fi}:</strong> {type.explanation_fi}
            </p>
            <p>{copy.explainerBody}</p>
          </div>
        </details>

        <div className="flex flex-wrap gap-2.5">
          <Link
            className={cn(ACTION, 'bg-forest-700 text-white hover:bg-forest-600')}
            href={`/vahtialueet/${alert.watchArea.id}`}
          >
            {copy.openArea}
          </Link>
          <a
            className={cn(
              ACTION,
              'border border-line bg-paper-raised text-forest-700 hover:border-line-strong',
            )}
            href={wfs.mapServiceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {copy.mapService}
            <span aria-hidden="true">&nbsp;↗</span>
            <span className="sr-only"> {copy.newTab}</span>
          </a>
        </div>
      </div>
    </div>
  )
}
