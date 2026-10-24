'use client'

import Link from 'next/link'

import { FormError } from '@/components/forms/form-error'
import { fi } from '@/i18n/fi'

const copy = fi.consent.banner

const choiceClass =
  'min-h-11 min-w-40 flex-1 cursor-pointer rounded-lg border border-forest-700 px-4.5 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

/**
 * First-visit cookie banner (Landing artboard `#consent`, `03b` §1). "Hyväksy kaikki" and "Vain
 * välttämättömät" have the same size and weight so neither is the nudged default; "Mukauta"
 * opens the modal. It is a non-modal region pinned to the bottom of the viewport, so the page
 * (the privacy policy included) stays readable and usable behind it.
 */
export function ConsentBanner({
  pending,
  error,
  onAcceptAll,
  onNecessaryOnly,
  onCustomize,
}: {
  pending: boolean
  error: string | null
  onAcceptAll: () => void
  onNecessaryOnly: () => void
  onCustomize: () => void
}) {
  return (
    <section
      aria-label={copy.label}
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-180 flex-col gap-3.5 rounded-xl border border-line bg-paper-raised p-5 text-ink shadow-pop"
      data-testid="consent-banner"
    >
      <p className="text-base">
        {copy.body}{' '}
        <Link className="text-forest-600 underline hover:text-forest-700" href="/evasteet">
          {copy.cookiesLink}
        </Link>
        {' · '}
        <Link className="text-forest-600 underline hover:text-forest-700" href="/tietosuoja">
          {copy.privacyLink}
        </Link>
      </p>
      <FormError>{error}</FormError>
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          className={`${choiceClass} bg-forest-700 text-white hover:bg-forest-600`}
          disabled={pending}
          type="button"
          onClick={onAcceptAll}
        >
          {copy.acceptAll}
        </button>
        <button
          className={`${choiceClass} bg-paper-raised text-forest-700 hover:bg-forest-50`}
          disabled={pending}
          type="button"
          onClick={onNecessaryOnly}
        >
          {copy.necessaryOnly}
        </button>
        <button
          className="min-h-11 cursor-pointer px-2 py-3 text-base font-semibold text-forest-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
          type="button"
          onClick={onCustomize}
        >
          {copy.customize}
        </button>
      </div>
    </section>
  )
}
