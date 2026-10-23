import Link from 'next/link'

import { systemAction } from '@/components/system-page'
import { fi } from '@/i18n/fi'

const copy = fi.auth.resetPassword.invalid

/**
 * The "expired or used" state of `/uusi-salasana`: shown by the page when the token names
 * no account and by the form when the token stopped being valid before the submit. A used,
 * an expired and a made-up link all land here, so the page confirms nothing about a token.
 */
export function ResetLinkInvalid() {
  return (
    <div
      className="flex flex-col items-center gap-3.5 text-center"
      data-state="invalid"
      data-testid="reset-outcome"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-14 items-center justify-center rounded-full bg-ember-100 text-2xl text-ember-700"
      >
        ✕
      </span>
      <h1 className="text-2xl font-bold text-balance text-forest-700">{copy.title}</h1>
      <p className="leading-relaxed text-pretty text-ink-muted">{copy.body}</p>
      <Link className={`${systemAction.primary} w-full`} href="/unohtunut-salasana">
        {copy.request}
      </Link>
      <Link className="text-sm font-semibold text-forest-600 hover:underline" href="/kirjaudu">
        {copy.login}
      </Link>
    </div>
  )
}
