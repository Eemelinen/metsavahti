'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fi } from '@/i18n/fi'
import { requestPasswordReset as sendResetEmail } from '@/lib/auth/password-reset'
import { forgotPasswordSchema } from '@/lib/auth/password-reset-schema'
import { type ActionResult, actionResult } from '@/lib/errors'
import { clientIp } from '@/lib/privacy/ip'
import { authRateLimiter } from '@/lib/rate-limit'

export type RequestPasswordResetResult = ActionResult<{
  /** Always `true`: the page shows the same confirmation whether or not the address exists. */
  sent: true
}>

/**
 * Server Action `requestPasswordReset` (E03 MV-045, `03-pages.md` `/unohtunut-salasana`):
 * every call counts against the per-IP auth limit (5/h, D-015), an unusable address is
 * the only visible refusal, and then the answer is the neutral confirmation whatever
 * happened: a registered address gets the `ResetPassword` email, an unknown one nothing,
 * one asked again within 60 s nothing either. The page never reveals who has an account.
 */
export async function requestPasswordReset(input: unknown): Promise<RequestPasswordResetResult> {
  const ip = clientIp(await headers())
  const limited = await actionResult(() => authRateLimiter.assert(`forgot:${ip ?? 'unknown'}`))
  if (!limited.ok) return limited

  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'internal', message: fi.auth.forgotPassword.errors.emailInvalid },
    }
  }
  const { email } = parsed.data

  return actionResult(async () => {
    const payload = await getPayload({ config })
    await sendResetEmail(payload, email)
    return { sent: true as const }
  })
}
