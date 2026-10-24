'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { DropdownMenu } from 'radix-ui'
import { cn } from 'cn'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Switch } from '@/components/ui/switch'
import { fi } from '@/i18n/fi'

import { deleteWatchArea, toggleWatchAreaNotifications } from './actions'

const copy = fi.watchAreas.dashboard

const menuItem = 'flex cursor-pointer rounded-md px-3 py-2.5 text-base outline-none select-none'

/** One card, already formatted on the server (`page.tsx`). */
export type WatchAreaCard = {
  id: number
  name: string
  /** "Rääkkylä, Pohjois-Karjala · säde 1 km" */
  place: string
  activeCount: number
  newCount: number
  /** "Tarkistettu 6.9.2026 klo 06.10" or "Ei vielä tarkistettu" */
  checked: string
  notificationsEnabled: boolean
}

type Status = { message: string } | { error: string } | null

/**
 * The cards of `/vahtialueet` (App artboard `vahtialueet`). The name opens the area's page;
 * the e-mail switch saves at once through `toggleWatchAreaNotifications` and moves back if the
 * save fails; the kebab offers "Muokkaa" and "Poista", which asks first and then refreshes the
 * page (the actions do not revalidate, MV-064). `data-hydrated` on the list tells the e2e
 * tests when a click on the switch or the kebab is no longer lost.
 */
export function WatchAreaCards({ areas }: { areas: WatchAreaCard[] }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [enabled, setEnabled] = useState(
    () => new Map(areas.map((a) => [a.id, a.notificationsEnabled])),
  )
  const [confirming, setConfirming] = useState<WatchAreaCard | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [deleting, startDelete] = useTransition()

  async function toggle(area: WatchAreaCard, on: boolean) {
    setStatus(null)
    setEnabled((m) => new Map(m).set(area.id, on))
    const result = await toggleWatchAreaNotifications({ id: area.id, enabled: on }).catch(
      () => null,
    )
    if (!result?.ok) {
      setEnabled((m) => new Map(m).set(area.id, !on))
      setStatus({ error: copy.failed })
    }
  }

  function remove(area: WatchAreaCard) {
    startDelete(async () => {
      const result = await deleteWatchArea(area.id).catch(() => null)
      setConfirming(null)
      if (!result?.ok) {
        setStatus({ error: copy.failed })
        return
      }
      setStatus({ message: copy.removed(area.name) })
      router.refresh()
    })
  }

  return (
    <>
      {status && 'error' in status ? <FormError>{status.error}</FormError> : null}
      {status && 'message' in status ? <FormSuccess>{status.message}</FormSuccess> : null}

      <ul
        className="grid gap-3.5 sm:grid-cols-2"
        data-hydrated={hydrated ? '' : undefined}
        data-testid="watch-area-list"
      >
        {areas.map((area) => (
          <li
            className="flex flex-col gap-3 rounded-xl border border-line bg-paper-raised p-4.5 transition-shadow hover:shadow-card"
            data-testid="watch-area-card"
            key={area.id}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold">
                <Link
                  className="rounded-sm text-forest-700 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  href={`/vahtialueet/${area.id}`}
                >
                  {area.name}
                </Link>
              </h2>
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                  aria-label={copy.actions(area.name)}
                  className="inline-flex size-9 flex-none items-center justify-center rounded-md text-lg leading-none text-ink-muted outline-none hover:bg-paper-sunken focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span aria-hidden="true">⋯</span>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    className="z-30 flex min-w-37.5 flex-col rounded-lg border border-line bg-paper-raised p-1.5 shadow-pop"
                    sideOffset={4}
                  >
                    <DropdownMenu.Item
                      asChild
                      className={cn(menuItem, 'text-ink data-highlighted:bg-paper-sunken')}
                    >
                      <Link href={`/vahtialueet/${area.id}/muokkaa`}>{copy.edit}</Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={cn(menuItem, 'text-ember-700 data-highlighted:bg-ember-100')}
                      onSelect={() => setConfirming(area)}
                    >
                      {copy.remove}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
            <p className="text-sm text-ink-muted">{area.place}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-paper-sunken px-2.5 py-1">
                {copy.active(area.activeCount)}
              </span>
              {area.newCount > 0 ? (
                <span className="rounded-full bg-amber-700 px-2.5 py-1 font-semibold text-white">
                  {copy.newAlerts(area.newCount)}
                </span>
              ) : null}
            </p>
            <div className="flex items-center justify-between gap-3 border-t border-paper-sunken pt-3 text-sm text-ink-muted">
              <span>{area.checked}</span>
              <Switch
                aria-label={copy.notifications(area.name)}
                checked={enabled.get(area.id) ?? area.notificationsEnabled}
                onCheckedChange={(on) => void toggle(area, on)}
                size="sm"
              />
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        cancelLabel={copy.cancel}
        confirmLabel={copy.confirmOk}
        description={confirming ? copy.confirmBody(confirming.name) : null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && remove(confirming)}
        open={confirming !== null}
        pending={deleting}
        title={copy.confirmTitle}
      />
    </>
  )
}
