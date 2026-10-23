import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import config from '@payload-config'
import { systemAction } from '@/components/system-page'
import { fi } from '@/i18n/fi'
import { verifyEmailToken } from '@/lib/auth/verification'

import { ResendButton } from '../vahvista-sahkoposti/resend-button'

const copy = fi.auth.verify

export const metadata: Metadata = { title: copy.verified.title, robots: { index: false } }
// The token is consumed on this request; the page must never be cached.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ token?: string | string[] }> }

const iconClass = 'inline-flex size-14 items-center justify-center rounded-full text-2xl'

/**
 * `/vahvista?token=` (App artboard `vahvistettu`, E03 MV-043): the link from `VerifyEmail`.
 * Success activates the account and points at the first watch area (`/aloita`, the wizard
 * of MV-05x; the route protection of MV-046 asks for a login on the way). An expired link
 * keeps its account pending and offers a resend to the same address; a used or unknown
 * link offers the login instead, because there is nothing left to resend to.
 */
export default async function VerifyPage({ searchParams }: Props) {
  const { token: raw } = await searchParams
  const token = Array.isArray(raw) ? raw[0] : raw
  const payload = await getPayload({ config })
  const outcome = await verifyEmailToken(payload, token)

  return (
    <div
      className="flex flex-col items-center gap-3.5 text-center"
      data-state={outcome.state}
      data-testid="verify-outcome"
    >
      {outcome.state === 'verified' ? (
        <>
          <span aria-hidden="true" className={`${iconClass} bg-forest-50 text-forest-700`}>
            ✓
          </span>
          <h1 className="text-2xl font-bold text-forest-700">{copy.verified.title}</h1>
          <p className="leading-relaxed text-ink-muted">{copy.verified.body}</p>
          <Link className={`${systemAction.primary} w-full`} href="/aloita">
            {copy.verified.cta}
          </Link>
        </>
      ) : outcome.state === 'expired' ? (
        <>
          <span aria-hidden="true" className={`${iconClass} bg-amber-100 text-amber-700`}>
            !
          </span>
          <h1 className="text-2xl font-bold text-balance text-forest-700">{copy.expired.title}</h1>
          <p className="leading-relaxed text-pretty text-ink-muted">
            {copy.expired.body} <strong className="text-ink">{outcome.email}</strong>.
          </p>
          <ResendButton email={outcome.email} />
        </>
      ) : (
        <>
          <span aria-hidden="true" className={`${iconClass} bg-ember-100 text-ember-700`}>
            ✕
          </span>
          <h1 className="text-2xl font-bold text-balance text-forest-700">{copy.used.title}</h1>
          <p className="leading-relaxed text-pretty text-ink-muted">{copy.used.body}</p>
          <Link className={`${systemAction.primary} w-full`} href="/kirjaudu">
            {copy.used.login}
          </Link>
          <Link
            className="text-sm font-semibold text-forest-600 hover:underline"
            href="/rekisteroidy"
          >
            {copy.used.register}
          </Link>
        </>
      )}
    </div>
  )
}
