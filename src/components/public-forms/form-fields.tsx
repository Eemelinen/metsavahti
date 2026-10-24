'use client'

import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { fi } from '@/i18n/fi'
import { HONEYPOT_FIELD } from '@/lib/public-forms/public-forms-schema'

const copy = fi.publicForms

export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p className="text-sm text-error" id={id} role="alert">
      {children}
    </p>
  )
}

/** Red asterisk of a required field (artboard); hidden from screen readers, `aria-required` says it. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-error">
      *
    </span>
  )
}

/** The consent checkbox both forms end with, linking to the privacy policy. */
export function ConsentCheckbox({ error, ...props }: ComponentProps<'input'> & { error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug"
        htmlFor="consent"
      >
        <input
          aria-describedby={error ? 'consent-error' : undefined}
          aria-invalid={error ? true : undefined}
          aria-required="true"
          className="mt-0.5 size-4.5 shrink-0 accent-forest-700"
          id="consent"
          type="checkbox"
          {...props}
        />
        <span>
          {copy.consentPrefix}{' '}
          <Link className="font-semibold text-forest-600 hover:underline" href="/tietosuoja">
            {copy.consentLink}
          </Link>{' '}
          {copy.consentSuffix} <RequiredMark />
        </span>
      </label>
      <FieldError id="consent-error">{error}</FieldError>
    </div>
  )
}

/**
 * The honeypot (ledger S9): an ordinary-looking text input moved out of sight with `sr-only`,
 * hidden from assistive technology and out of the tab order, so only a bot fills it.
 */
export function HoneypotField(props: ComponentProps<'input'>) {
  return (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor={HONEYPOT_FIELD}>{copy.honeypot}</label>
      <input autoComplete="off" id={HONEYPOT_FIELD} tabIndex={-1} type="text" {...props} />
    </div>
  )
}

/** The success state that replaces a sent form (artboard: check mark, title, body, "Lähetä toinen viesti"). */
export function SentState({
  title,
  children,
  onReset,
}: {
  title: string
  children: ReactNode
  onReset: () => void
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 py-6 text-center"
      data-testid="public-form-sent"
      role="status"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-14 items-center justify-center rounded-full bg-forest-50 text-2xl text-forest-700"
      >
        ✓
      </span>
      <h2 className="text-xl font-bold text-forest-700">{title}</h2>
      <p className="max-w-100 leading-normal text-ink-muted">{children}</p>
      <Button onClick={onReset} type="button" variant="link">
        {copy.sendAnother}
      </Button>
    </div>
  )
}
