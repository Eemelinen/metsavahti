import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import config from '@payload-config'
import { systemAction } from '@/components/system-page'
import { fi } from '@/i18n/fi'
import { applyEmailChange } from '@/lib/account/email-change'

const copy = fi.account.emailChange

export const metadata: Metadata = { title: copy.changed.title, robots: { index: false } }
// The token is consumed on this request; the page must never be cached.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ token?: string | string[] }> }

const iconClass = 'inline-flex size-14 items-center justify-center rounded-full text-2xl'

/**
 * `/vaihda-sahkoposti/vahvista?token=` (`03-pages.md`, E04 MV-052): the link from
 * `ChangeEmailConfirm`. A valid link makes the pending address the login address and marks it
 * verified; a used, expired, replaced or made-up link changes nothing. Public like `/vahvista`
 * (the link may be opened on a device that is not signed in); the layout matches it.
 */
export default async function ConfirmEmailChangePage({ searchParams }: Props) {
  const { token: raw } = await searchParams
  const token = Array.isArray(raw) ? raw[0] : raw
  const payload = await getPayload({ config })
  const outcome = await applyEmailChange(payload, token)

  return (
    <div
      className="flex flex-col items-center gap-3.5 text-center"
      data-state={outcome.state}
      data-testid="email-change-outcome"
    >
      {outcome.state === 'changed' ? (
        <>
          <span aria-hidden="true" className={`${iconClass} bg-forest-50 text-forest-700`}>
            ✓
          </span>
          <h1 className="text-2xl font-bold text-forest-700">{copy.changed.title}</h1>
          <p className="leading-relaxed text-pretty text-ink-muted">
            {copy.changed.body} <strong className="text-ink">{outcome.email}</strong>.
          </p>
          <Link className={`${systemAction.primary} w-full`} href="/tili">
            {copy.changed.cta}
          </Link>
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className={`${iconClass} ${outcome.state === 'taken' ? 'bg-amber-100 text-amber-700' : 'bg-ember-100 text-ember-700'}`}
          >
            {outcome.state === 'taken' ? '!' : '✕'}
          </span>
          <h1 className="text-2xl font-bold text-balance text-forest-700">
            {copy[outcome.state].title}
          </h1>
          <p className="leading-relaxed text-pretty text-ink-muted">{copy[outcome.state].body}</p>
          <Link className={`${systemAction.primary} w-full`} href="/tili">
            {copy[outcome.state].cta}
          </Link>
        </>
      )}
    </div>
  )
}
