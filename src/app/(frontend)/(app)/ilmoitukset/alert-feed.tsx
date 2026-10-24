'use client'

import { cn } from 'cn'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type MouseEvent, useState, useTransition } from 'react'

import { AlertItem, alertMapHref } from '@/components/alerts/alert-item'
import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { fi } from '@/i18n/fi'
import type { AlertFeed as AlertFeedData, AlertFeedItem } from '@/lib/alerts/feed'
import { alertFeedQuery } from '@/lib/alerts/feed-query'

import { markAlertRead, markAllAlertsRead } from './actions'

const copy = fi.alerts.feed

const PAGE_LINK =
  'inline-flex min-h-10 items-center self-center rounded-lg border border-line bg-paper-raised px-3.5 py-2 text-sm font-semibold text-forest-700 outline-none hover:border-line-strong focus-visible:ring-3 focus-visible:ring-ring/50'

/**
 * The interactive part of `/ilmoitukset` (App artboard `ilmoitukset`): the watch-area filter,
 * "Merkitse kaikki luetuiksi", the date groups and the page links. The server page has already
 * loaded the page the URL names; the filter replaces the search params and the page renders
 * again. Both actions refresh the router, so the list and the nav badge update together.
 * "Näytä kartalla" on an unread alert marks it read before it navigates (a modified click opens
 * the link as it is). `data-hydrated` tells the e2e tests when a click is no longer lost.
 */
export function AlertFeed({ feed, paged }: { feed: AlertFeedData; paged: boolean }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<'marked' | 'failed' | null>(null)
  const empty = feed.groups.length === 0

  function filterBy(value: string) {
    setOutcome(null)
    startTransition(() =>
      router.replace(
        `/ilmoitukset${alertFeedQuery({ watchAreaId: value ? Number(value) : null })}`,
      ),
    )
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllAlertsRead(feed.watchAreaId).catch(() => null)
      setOutcome(result?.ok ? 'marked' : 'failed')
    })
  }

  function showOnMap(item: AlertFeedItem, event: MouseEvent<HTMLAnchorElement>) {
    if (!item.unread || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    startTransition(async () => {
      // A failed stamp must not keep the user from the map; the alert just stays unread.
      await markAlertRead(item.id).catch(() => null)
      router.push(alertMapHref(item))
    })
  }

  return (
    <div
      className="flex w-full max-w-3xl flex-col gap-5"
      data-hydrated={hydrated ? '' : undefined}
      data-testid="alert-feed"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-forest-700">{copy.title}</h1>
        {feed.unreadCount > 0 ? (
          <button
            className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-line bg-paper-raised px-3.5 py-2 text-sm font-semibold text-forest-700 outline-none hover:border-line-strong focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60"
            disabled={pending}
            onClick={markAll}
            type="button"
          >
            {copy.markAllRead}
          </button>
        ) : null}
      </div>

      {feed.watchAreas.length > 1 ? (
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="alert-feed-area">{copy.filter}</Label>
          <NativeSelect
            id="alert-feed-area"
            onChange={(e) => filterBy(e.target.value)}
            value={feed.watchAreaId === null ? '' : String(feed.watchAreaId)}
          >
            <option value="">{copy.allAreas}</option>
            {feed.watchAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <div aria-live="polite">
        {outcome === 'marked' ? <FormSuccess>{copy.markedAllRead}</FormSuccess> : null}
        {outcome === 'failed' ? <FormError>{copy.failed}</FormError> : null}
      </div>

      {empty && !paged ? (
        <div
          className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-sage-300 bg-paper-raised px-6 py-12 text-center"
          data-testid="alert-feed-empty"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-14 items-center justify-center rounded-full bg-forest-50 text-forest-700"
          >
            <Check className="size-6" strokeWidth={2.5} />
          </span>
          {feed.watchAreaId === null ? (
            <>
              <h2 className="text-xl font-semibold text-forest-700">{copy.emptyTitle}</h2>
              <p className="text-ink-muted">{copy.emptyBody}</p>
            </>
          ) : (
            <p className="text-ink-muted">{copy.emptyArea}</p>
          )}
        </div>
      ) : (
        <div className={cn('flex flex-col gap-6', pending && 'opacity-60')} aria-busy={pending}>
          {feed.groups.map((group) => (
            <section
              aria-labelledby={`paiva-${group.day}`}
              className="flex flex-col gap-2.5"
              key={group.day}
            >
              <h2
                className="text-sm font-semibold tracking-wide text-ink-muted uppercase"
                id={`paiva-${group.day}`}
              >
                {group.label}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <AlertItem
                    item={item}
                    key={item.id}
                    onShowOnMap={(event) => showOnMap(item, event)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {paged || feed.nextCursor ? (
        <nav aria-label={copy.pages} className="flex flex-wrap justify-center gap-3">
          {paged ? (
            <Link className={PAGE_LINK} href={`/ilmoitukset${alertFeedQuery(feed)}`}>
              {copy.newest}
            </Link>
          ) : null}
          {feed.nextCursor ? (
            <Link
              className={PAGE_LINK}
              href={`/ilmoitukset${alertFeedQuery({ watchAreaId: feed.watchAreaId, cursor: feed.nextCursor })}`}
            >
              {copy.older}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}
