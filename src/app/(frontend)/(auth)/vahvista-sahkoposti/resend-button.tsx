'use client'

import { useEffect, useState } from 'react'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { Button } from '@/components/ui/button'
import { fi } from '@/i18n/fi'
import { RESEND_COOLDOWN_SECONDS } from '@/lib/auth/verification-schema'

import { resendVerification } from './actions'

const copy = fi.auth.verifyEmail

/**
 * "Lähetä uudelleen" with its cooldown (App artboard `vahvista`): after a send the button
 * counts down from 60 s; a server refusal shorter than the cooldown (a reload in between)
 * becomes the countdown too, anything else is shown as an error.
 */
export function ResendButton({ email }: { email: string }) {
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      const result = await resendVerification({ email })
      if (result.ok) {
        setSent(true)
        setCooldown(result.data.cooldownSeconds)
        return
      }
      const retry = result.error.retryAfterSeconds
      if (result.error.code === 'rate_limited' && retry && retry <= RESEND_COOLDOWN_SECONDS) {
        setCooldown(retry)
        return
      }
      setError(result.error.message)
    } finally {
      setBusy(false)
    }
  }

  const label = cooldown > 0 ? `${copy.resend} (${cooldown} s)` : copy.resend
  return (
    <div className="flex w-full flex-col gap-3">
      <FormSuccess>{sent ? copy.resent : null}</FormSuccess>
      <FormError>{error}</FormError>
      <Button
        className="w-full"
        disabled={busy || cooldown > 0}
        onClick={onClick}
        size="xl"
        type="button"
        variant="outline"
      >
        {label}
      </Button>
    </div>
  )
}
