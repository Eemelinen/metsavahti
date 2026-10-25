import { cn } from 'cn'
import { CircleMinus, FilePenLine, type LucideIcon, Sparkles, Spline } from 'lucide-react'
import Link from 'next/link'

import { formatAreaHa, formatDistance } from '@/components/map/declaration-popover'
import type { CuttingColourToken } from '@/config/cutting-types'
import { fi } from '@/i18n/fi'
import type { AlertFeedItem } from '@/lib/alerts/feed'
import type { AlertChangeType } from '@/payload/collections/Alerts'

const copy = fi.alerts.feed

const COLOUR: Record<CuttingColourToken, string> = {
  uudistus: 'bg-cut-uudistus',
  harvennus: 'bg-cut-harvennus',
  muu: 'bg-cut-muu',
}

/** Icon and tag colours of each change type; the label and explanation live in `fi.ts`. */
const CHANGE_TYPE: Record<AlertChangeType, { icon: LucideIcon; className: string }> = {
  new: { icon: Sparkles, className: 'bg-amber-100 text-ink' },
  geometry_changed: { icon: Spline, className: 'bg-forest-50 text-forest-700' },
  attributes_changed: { icon: FilePenLine, className: 'bg-forest-50 text-forest-700' },
  removed: { icon: CircleMinus, className: 'bg-paper-sunken text-ink-muted' },
}

/** The change type as a small tag with its icon ("Uusi ilmoitus", "Rajaus muuttunut", …). */
export function ChangeTypeTag({ type }: { type: AlertChangeType }) {
  const { icon: Icon, className } = CHANGE_TYPE[type]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        className,
      )}
      data-change-type={type}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      {fi.alerts.changeType[type].label}
    </span>
  )
}

/** Where "Näytä kartalla" goes: the alert's own page, which marks it read (MV-082). */
export function alertMapHref(item: Pick<AlertFeedItem, 'id'>): string {
  return `/ilmoitukset/${item.id}`
}

/**
 * One alert of the feed (`03-pages.md` `AlertItem`, App artboard `ilmoitukset`): the cutting
 * type's colour and label, the change type, an unread dot, "area · ha · distance · klo time"
 * and "Näytä kartalla". A change other than a new declaration also says what changed. Read
 * alerts sit on the page colour instead of the artboard's 72 % opacity, which would take the
 * muted text below AA contrast.
 */
export function AlertItem({ item }: { item: AlertFeedItem }) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border border-line px-4 py-3.5',
        item.unread ? 'bg-paper-raised shadow-card' : 'bg-paper',
      )}
      data-alert-id={item.id}
      data-testid="alert-item"
      data-unread={item.unread ? '' : undefined}
    >
      <span
        aria-hidden="true"
        className={cn('h-10 w-3 flex-none rounded-sm', COLOUR[item.colourToken])}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className={cn('text-base', item.unread ? 'text-ink' : 'font-semibold')}>
            {item.cuttingTypeLabel}
          </strong>
          <ChangeTypeTag type={item.changeType} />
          {item.unread ? (
            <span className="size-2 flex-none rounded-full bg-amber-500" data-testid="unread-dot">
              <span className="sr-only">{copy.unread}</span>
            </span>
          ) : null}
        </div>
        <span className="text-sm text-ink-muted">
          {copy.meta(
            item.watchArea.name,
            formatAreaHa(item.areaHa),
            formatDistance(item.distanceM),
            item.time,
          )}
        </span>
        {item.changeType === 'new' ? null : (
          <span className="text-sm text-ink-muted">
            {fi.alerts.changeType[item.changeType].explanation}
          </span>
        )}
      </div>
      <Link
        aria-label={copy.showOnMapLabel(item.cuttingTypeLabel, item.watchArea.name)}
        className="inline-flex min-h-10 flex-none items-center rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm font-semibold text-forest-700 outline-none hover:border-line-strong focus-visible:ring-3 focus-visible:ring-ring/50"
        href={alertMapHref(item)}
      >
        {copy.showOnMap}
      </Link>
    </li>
  )
}
