'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import { resendCooldownLimiter, resendVerificationEmail } from '@/lib/auth/verification'
import { RESEND_COOLDOWN_SECONDS, resendVerificationSchema } from '@/lib/auth/verification-schema'
import { fi } from '@/i18n/fi'
import { type ActionResult, actionResult } from '@/lib/errors'
import { clientIp } from '@/lib/privacy/ip'
import { authRateLimiter } from '@/lib/rate-limit'

export type ResendVerificationResult = ActionResult<{
  /** How long the button stays disabled (seconds). */
  cooldownSeconds: number
}>

/**
 * Server Action `resendVerification` (E03 MV-043, `03-pages.md` `/vahvista-sahkoposti`).
 * Every call counts against the per-IP auth limit, then the address gets one send per
 * 60 s (`rate_limited` with `retryAfterSeconds` ≤ 60 otherwise, which the button shows as
 * its countdown). Unknown and already verified addresses get the same success as a pending
 * one so the page never reveals who has an account.
 */
export async function resendVerification(input: unknown): Promise<ResendVerificationResult> {
  const ip = clientIp(await headers())
  const limited = await actionResult(() => authRateLimiter.assert(`resend:${ip ?? 'unknown'}`))
  if (!limited.ok) return limited

  const parsed = resendVerificationSchema.safeParse(input)
  if (!parsed.success) {
    // The address comes from the query string; garbage there is not a server error.
    return { ok: false, error: { code: 'internal', message: fi.auth.register.errors.emailInvalid } }
  }
  const { email } = parsed.data

  return actionResult(async () => {
    resendCooldownLimiter.assert(`resend-email:${email}`)
    const payload = await getPayload({ config })
    await resendVerificationEmail(payload, email)
    return { cooldownSeconds: RESEND_COOLDOWN_SECONDS }
  })
}
