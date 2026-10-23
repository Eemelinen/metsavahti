'use client'

import * as React from 'react'
import { cn } from 'cn'

import { Input } from '@/components/ui/input'
import { fi } from '@/i18n/fi'
import type { PasswordScore, PasswordStrength } from '@/lib/auth/password-strength'

const copy = fi.forms.password

/** Filled-bar colour per zxcvbn score (App artboard `pwColors`); empty bars are paper-sunken. */
const BAR_COLOUR: Record<PasswordScore, string> = {
  0: 'bg-ember-500',
  1: 'bg-ember-500',
  2: 'bg-amber-300',
  3: 'bg-forest-300',
  4: 'bg-forest-600',
}
const BARS: PasswordScore[] = [1, 2, 3, 4]

export type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  /** Render the zxcvbn strength meter under the field (registration, new password). */
  showStrength?: boolean
  /** Words zxcvbn should penalise (the user's email, name). */
  strengthInputs?: string[]
}

/**
 * Password field with a show/hide toggle and an optional strength meter (App artboard,
 * `kirjaudu` / `rekisteroidy`). Works uncontrolled with react-hook-form `register()` and
 * controlled with `value`. The zxcvbn scorer is loaded on first keystroke so the login
 * bundle does not carry it.
 */
export function PasswordInput({
  className,
  id: idProp,
  onChange,
  showStrength = false,
  strengthInputs,
  'aria-describedby': ariaDescribedBy,
  ...props
}: PasswordInputProps) {
  const generatedId = React.useId()
  const id = idProp ?? generatedId
  const strengthId = `${id}-strength`
  const [visible, setVisible] = React.useState(false)
  const [value, setValue] = React.useState(() => String(props.value ?? props.defaultValue ?? ''))
  // The score is keyed by the value it was computed for, so a stale result is never shown
  // while the lazily loaded scorer catches up with the latest keystroke.
  const [scored, setScored] = React.useState<(PasswordStrength & { forValue: string }) | null>(null)
  const strength = scored && scored.forValue === value ? scored : null
  const inputsKey = strengthInputs?.join('\u0000') ?? ''

  React.useEffect(() => {
    if (!showStrength || value === '') return
    let cancelled = false
    void import('@/lib/auth/password-strength').then(({ scorePassword }) => {
      if (cancelled) return
      setScored({
        ...scorePassword(value, inputsKey ? inputsKey.split('\u0000') : []),
        forValue: value,
      })
    })
    return () => {
      cancelled = true
    }
  }, [showStrength, value, inputsKey])

  const describedBy =
    [ariaDescribedBy, showStrength ? strengthId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5" data-slot="password-input">
      <div className="relative">
        <Input
          {...props}
          aria-describedby={describedBy}
          className={cn('pr-20', className)}
          id={id}
          onChange={(event) => {
            setValue(event.target.value)
            onChange?.(event)
          }}
          type={visible ? 'text' : 'password'}
        />
        <button
          aria-label={visible ? copy.hideLabel : copy.showLabel}
          aria-pressed={visible}
          className="absolute top-1.5 right-1.5 h-8.5 rounded-md px-2.5 text-sm font-semibold text-ink-muted hover:bg-paper-sunken"
          onClick={() => setVisible((v) => !v)}
          type="button"
        >
          {visible ? copy.hide : copy.show}
        </button>
      </div>
      {showStrength && (
        <div id={strengthId}>
          <div
            aria-label={copy.strengthMeter}
            aria-valuemax={4}
            aria-valuemin={0}
            aria-valuenow={strength?.score ?? 0}
            aria-valuetext={strength?.label ?? copy.strengthHint}
            className="flex gap-1"
            role="meter"
          >
            {BARS.map((bar) => (
              <span
                className={cn(
                  'h-1 flex-1 rounded-full',
                  strength && strength.score >= bar
                    ? BAR_COLOUR[strength.score]
                    : 'bg-paper-sunken',
                )}
                data-filled={strength ? strength.score >= bar : false}
                key={bar}
              />
            ))}
          </div>
          <p
            aria-live="polite"
            className="mt-1 text-sm text-ink-muted"
            data-slot="password-strength"
          >
            {strength?.label ?? copy.strengthHint}
          </p>
        </div>
      )}
    </div>
  )
}
