import type { Metadata } from 'next'
import Link from 'next/link'

import { systemAction } from '@/components/system-page'
import { fi } from '@/i18n/fi'
import { EMAIL_SETTINGS_PATH } from '@/emails/EmailLayout'
import { UNSUBSCRIBE_PAGE_STATE } from '@/lib/notifications/unsubscribe'

const copy = fi.unsubscribe

export const metadata: Metadata = { title: copy.metaTitle, robots: { index: false } }

type Props = { searchParams: Promise<{ tila?: string | string[] }> }

const iconClass = 'inline-flex size-14 items-center justify-center rounded-full text-2xl'

const STATES = {
  [UNSUBSCRIBE_PAGE_STATE.unsubscribed]: { copy: copy.done, icon: '✓', tone: 'done' },
  [UNSUBSCRIBE_PAGE_STATE.used]: { copy: copy.used, icon: '✓', tone: 'done' },
  [UNSUBSCRIBE_PAGE_STATE.expired]: { copy: copy.expired, icon: '!', tone: 'warn' },
} as const

/**
 * `/ilmoitukset-lopetettu?tila=` (MV-073): where `GET /api/notifications/unsubscribe` sends the
 * unsubscribe link of an alert email. Public like `/tili-poistettu` (the link works without a
 * session); it only shows the outcome the route already applied, so a reload changes nothing.
 * An unknown `tila` reads as an expired link. The login link leads to the settings page.
 */
export default async function UnsubscribedPage({ searchParams }: Props) {
  const { tila } = await searchParams
  const key = Array.isArray(tila) ? tila[0] : tila
  const state = STATES[key as keyof typeof STATES] ?? STATES[UNSUBSCRIBE_PAGE_STATE.expired]

  return (
    <div
      className="flex flex-col items-center gap-3.5 text-center"
      data-state={key && key in STATES ? key : UNSUBSCRIBE_PAGE_STATE.expired}
      data-testid="unsubscribe-outcome"
    >
      <span
        aria-hidden="true"
        className={`${iconClass} ${state.tone === 'done' ? 'bg-forest-50 text-forest-700' : 'bg-amber-100 text-amber-700'}`}
      >
        {state.icon}
      </span>
      <h1 className="text-2xl font-bold text-balance text-forest-700">{state.copy.title}</h1>
      <p className="leading-relaxed text-pretty text-ink-muted">{state.copy.body}</p>
      <Link
        className={`${systemAction.primary} w-full`}
        href={`/kirjaudu?next=${encodeURIComponent(EMAIL_SETTINGS_PATH)}`}
      >
        {copy.login}
      </Link>
    </div>
  )
}
