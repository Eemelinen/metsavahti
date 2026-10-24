'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { cn } from 'cn'

import { APP_NAV_ITEMS } from '@/components/app-shell/nav'
import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { fi } from '@/i18n/fi'
import { NOTIFICATION_MODES, type NotificationMode } from '@/lib/account/account-schema'
import type {
  NotificationSettings,
  WatchAreaNotificationRow,
} from '@/lib/account/notification-settings'

import {
  sendTestEmail,
  setMarketingConsent,
  setWatchAreaNotifications,
  updateNotificationPrefs,
} from './actions'

const copy = fi.account.notifications

const watchAreasHref = APP_NAV_ITEMS.find((item) => item.section === 'vahtialueet')!.href

function modeLabel(mode: NotificationMode, dailyHour: number): string {
  if (mode === 'daily') return copy.modes.daily(String(dailyHour).padStart(2, '0'))
  return copy.modes[mode]
}

type Status = { message: string } | { error: string } | null

type SaveResult = { ok: true } | { ok: false; error: { message: string } }

const failed = { ok: false, error: { message: copy.failed } } as const

/**
 * The `/tili/ilmoitukset` cards (App artboard `ilmoitusasetukset`). Each switch and the mode
 * save on change: the control moves at once, the Server Action runs, and on failure the control
 * moves back and the error shows in the banner above the cards.
 *
 * Saves run one after another: Payload writes the whole `users` row on every update, so two
 * overlapping saves (the mode and the marketing switch, say) would let the later write put back
 * the value the earlier one changed. `aria-busy` is set while any save is still running.
 */
export function NotificationSettingsForm({
  settings,
  areas: initialAreas,
  email,
}: {
  settings: NotificationSettings
  areas: WatchAreaNotificationRow[]
  email: string
}) {
  const hydrated = useHydrated()
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [running, setRunning] = useState(0)
  const [prefs, setPrefs] = useState(settings)
  const [areas, setAreas] = useState(initialAreas)
  const [status, setStatus] = useState<Status>(null)

  /** Queue `task` behind the saves already running. */
  function enqueue(task: () => Promise<void>) {
    setStatus(null)
    setRunning((n) => n + 1)
    queue.current = queue.current.then(task).finally(() => setRunning((n) => n - 1))
  }

  /** Run `save`; on failure call `revert` and show the error. */
  function save(call: () => Promise<SaveResult>, revert: () => void) {
    enqueue(async () => {
      // A request that never reaches the server (offline) rejects instead of returning a result.
      const result = await call().catch(() => failed)
      if (!result.ok) {
        revert()
        setStatus({ error: result.error.message })
        return
      }
      setStatus({ message: copy.saved })
    })
  }

  function savePref<K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K],
    call: () => Promise<SaveResult>,
  ) {
    const previous = prefs[key]
    setPrefs((p) => ({ ...p, [key]: value }))
    save(call, () => setPrefs((p) => ({ ...p, [key]: previous })))
  }

  function setAreaEnabled(id: number, enabled: boolean) {
    const update = (on: boolean) =>
      setAreas((list) =>
        list.map((area) => (area.id === id ? { ...area, notificationsEnabled: on } : area)),
      )
    update(enabled)
    save(
      () => setWatchAreaNotifications({ id, enabled }),
      () => update(!enabled),
    )
  }

  function onSendTest() {
    enqueue(async () => {
      const result = await sendTestEmail().catch(() => failed)
      setStatus(result.ok ? { message: copy.testSent(email) } : { error: result.error.message })
    })
  }

  return (
    <div
      aria-busy={running > 0 ? true : undefined}
      className="flex max-w-160 flex-col gap-4"
      data-hydrated={hydrated ? '' : undefined}
      data-testid="notification-settings"
    >
      <FormSuccess>{status && 'message' in status ? status.message : null}</FormSuccess>
      <FormError>{status && 'error' in status ? status.error : null}</FormError>

      <section className="flex flex-col gap-4 rounded-xl border border-line bg-paper-raised p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold" id="email-notifications-label">
              {copy.email}
            </div>
            <div className="text-sm text-ink-muted" id="email-notifications-hint">
              {copy.emailHint}
            </div>
          </div>
          <Switch
            aria-describedby="email-notifications-hint"
            aria-labelledby="email-notifications-label"
            checked={prefs.enabled}
            onCheckedChange={(enabled) =>
              savePref('enabled', enabled, () => updateNotificationPrefs({ enabled }))
            }
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{copy.mode}</legend>
          <div className="grid gap-1.5 rounded-xl bg-paper-sunken p-1 sm:grid-cols-3">
            {NOTIFICATION_MODES.map((mode) => (
              <label
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 text-center text-sm font-semibold text-ink-muted transition-colors',
                  'has-checked:bg-paper-raised has-checked:text-forest-700 has-checked:shadow-card has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                )}
                key={mode}
              >
                <input
                  checked={prefs.mode === mode}
                  className="sr-only"
                  name="mode"
                  onChange={() => savePref('mode', mode, () => updateNotificationPrefs({ mode }))}
                  type="radio"
                  value={mode}
                />
                {modeLabel(mode, prefs.dailyHour)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section
        aria-labelledby="area-settings-title"
        className="flex flex-col gap-2.5 rounded-xl border border-line bg-paper-raised p-5"
      >
        <h2 className="text-lg font-semibold text-forest-700" id="area-settings-title">
          {copy.areas}
        </h2>
        {prefs.enabled ? null : <p className="text-sm text-ink-muted">{copy.areasOff}</p>}
        {areas.length === 0 ? (
          <div className="flex flex-col items-start gap-3" data-testid="area-settings-empty">
            <p className="text-sm text-ink-muted">{copy.noAreas}</p>
            <Link
              className="text-sm font-semibold text-forest-600 hover:underline"
              href={watchAreasHref}
            >
              {copy.createArea}
            </Link>
          </div>
        ) : (
          <ul>
            {areas.map((area) => (
              <li
                className="flex items-center justify-between gap-3 border-b border-paper-sunken py-2.5 last:border-b-0"
                data-testid="area-settings-row"
                key={area.id}
              >
                <div>
                  <strong>{area.name}</strong>
                  {area.addressLabel ? (
                    <>
                      <br />
                      <span className="text-sm text-ink-muted">{area.addressLabel}</span>
                    </>
                  ) : null}
                </div>
                <Switch
                  aria-label={copy.areaSwitch(area.name)}
                  checked={area.notificationsEnabled}
                  onCheckedChange={(enabled) => setAreaEnabled(area.id, enabled)}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3.5 rounded-xl border border-line bg-paper-raised p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold" id="marketing-label">
              {copy.marketing}
            </div>
            <div className="text-sm text-ink-muted" id="marketing-hint">
              {copy.marketingHint}
            </div>
          </div>
          <Switch
            aria-describedby="marketing-hint"
            aria-labelledby="marketing-label"
            checked={prefs.marketing}
            onCheckedChange={(granted) =>
              savePref('marketing', granted, () => setMarketingConsent({ granted }))
            }
          />
        </div>
        <div>
          <Button
            className="h-11 px-4 font-semibold text-forest-700"
            disabled={running > 0}
            onClick={onSendTest}
            type="button"
            variant="outline"
          >
            {copy.sendTest}
          </Button>
        </div>
      </section>
    </div>
  )
}
