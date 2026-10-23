import type { Metadata } from 'next'
import Link from 'next/link'

import { fi } from '@/i18n/fi'

import { ResendButton } from './resend-button'

const copy = fi.auth.verifyEmail

export const metadata: Metadata = { title: copy.title, robots: { index: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * `/vahvista-sahkoposti?email=` (App artboard `vahvista`): where registration lands, with
 * "Lähetä uudelleen" and its 60 s cooldown (E03 MV-043). With `required=1` it is the
 * interstitial an unverified session is sent to (artboard `vahvistus_vaaditaan`). The address
 * comes from the query string only: it is echoed as text and passed to the resend action,
 * which reveals nothing about it.
 */
export default async function VerifyEmailPage({ searchParams }: Props) {
  const params = await searchParams
  const email = first(params.email)
  const required = first(params.required) === '1'
  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      {required ? (
        <p className="font-mono text-sm tracking-widest text-ink-muted" data-testid="system-code">
          {copy.required.code}
        </p>
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-14 items-center justify-center rounded-full bg-forest-50 text-2xl text-forest-700"
        >
          ✉
        </span>
      )}
      <h1 className="text-2xl font-bold text-balance text-forest-700">
        {required ? copy.required.title : copy.title}
      </h1>
      <p className="leading-relaxed text-pretty text-ink-muted">
        {required ? (
          copy.required.body
        ) : (
          <>
            {email ? (
              <>
                {copy.sentTo} <strong className="text-ink">{email}</strong>.
              </>
            ) : (
              copy.sentToUnknown
            )}{' '}
            {copy.validFor}
          </>
        )}
      </p>
      {email ? <ResendButton email={email} /> : null}
      {required ? (
        <Link className="text-sm font-semibold text-forest-600 hover:underline" href="/">
          {copy.required.home}
        </Link>
      ) : (
        <Link
          className="text-sm font-semibold text-forest-600 hover:underline"
          href="/rekisteroidy"
        >
          {copy.changeEmail}
        </Link>
      )}
    </div>
  )
}
