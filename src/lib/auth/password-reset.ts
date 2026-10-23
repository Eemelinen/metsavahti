import { APIError, type Payload } from 'payload'

import { fi } from '@/i18n/fi'
import { scorePassword } from '@/lib/auth/password-strength'
import { passwordUserInputs } from '@/lib/auth/registration-schema'
import {
  type ResetPasswordFieldErrors,
  type ResetPasswordFormValues,
} from '@/lib/auth/password-reset-schema'
import { RESEND_COOLDOWN_SECONDS } from '@/lib/auth/verification-schema'
import { createRateLimiter } from '@/lib/rate-limit'
import type { User } from '@/payload-types'

/**
 * One reset email per address per cooldown window, on top of the per-IP `authRateLimiter`:
 * a form that is submitted twice, or from several addresses at once, cannot flood a mailbox.
 * The refusal is silent (the page shows the same neutral confirmation), so it reveals
 * nothing about the address.
 */
export const resetCooldownLimiter = createRateLimiter({
  limit: 1,
  windowMs: RESEND_COOLDOWN_SECONDS * 1000,
})

export type ResetRequestOutcome =
  /** A registered address: Payload stored a fresh token and sent `ResetPassword`. */
  | { status: 'sent' }
  /** Unknown address, or one that got an email within the cooldown; nothing sent. Never revealed. */
  | { status: 'skipped' }

/**
 * `/unohtunut-salasana` (E03 MV-045): ask Payload for a reset token and the email. Payload
 * itself stays silent about unknown addresses (`forgotPassword` returns `null` and writes
 * nothing), the token is 20 random bytes valid for `Users.auth.forgotPassword.expiration`
 * (one hour) and the template comes from the collection's `generateEmailHTML`, so the REST
 * endpoint and the admin UI send the same message. Only the HTML part is sent: Payload's
 * hook has no text-part slot (as with `VerifyEmail`).
 */
export async function requestPasswordReset(
  payload: Payload,
  email: string,
): Promise<ResetRequestOutcome> {
  if (!resetCooldownLimiter.check(`reset-email:${email}`).allowed) return { status: 'skipped' }
  const token = await payload.forgotPassword({
    collection: 'users',
    data: { email },
    overrideAccess: true,
  })
  return { status: token ? 'sent' : 'skipped' }
}

/**
 * The account whose unexpired reset token this is, or `null`. Payload keeps
 * `resetPasswordToken` / `resetPasswordExpiration` as hidden fields and nulls the expiry
 * when the token is used, so a used link, an expired one and a made-up one all answer the
 * same. Used by `/uusi-salasana` to show the form or the "expired or used" state before
 * the person types a password.
 */
export async function findPasswordResetUser(
  payload: Payload,
  token: string | undefined,
  now: number = Date.now(),
): Promise<User | null> {
  if (!token) return null
  const { docs } = await payload.find({
    collection: 'users',
    where: {
      and: [
        { resetPasswordToken: { equals: token } },
        { resetPasswordExpiration: { greater_than: new Date(now).toISOString() } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return docs[0] ?? null
}

export type ResetOutcome =
  /** The password changed; every session of the account is gone. */
  | { status: 'reset'; email: string }
  /** No account carries this unexpired token: used, expired or never issued. */
  | { status: 'invalid' }
  /** The password fails the zxcvbn requirement against the account's address. */
  | { status: 'weak'; fieldErrors: ResetPasswordFieldErrors }

/**
 * `/uusi-salasana` (E03 MV-045): set the password behind a valid token and end every
 * session of the account, on any device, so a stolen or forgotten login stops working
 * ("reset invalidates other sessions"). Payload's `resetPassword` checks the token and its
 * expiry, hashes the password, stamps the token used and starts a session of its own; that
 * session is dropped with the rest because the page sends the person to `/kirjaudu` instead
 * of setting a cookie (`03-pages.md`: "success → `/kirjaudu`"). The reset also clears a
 * login lockout: someone who resets a locked account should be able to use the new
 * password at once. The strength rule is the registration one (score ≥ 3 with the address
 * and its local part penalised), which is why the account is looked up first.
 */
export async function resetUserPassword(
  payload: Payload,
  { token, password }: Pick<ResetPasswordFormValues, 'token' | 'password'>,
): Promise<ResetOutcome> {
  const user = await findPasswordResetUser(payload, token)
  if (!user) return { status: 'invalid' }
  if (!scorePassword(password, passwordUserInputs(user.email)).acceptable) {
    return {
      status: 'weak',
      fieldErrors: { password: fi.auth.resetPassword.errors.passwordTooWeak },
    }
  }
  try {
    await payload.resetPassword({
      collection: 'users',
      data: { token, password },
      overrideAccess: true,
    })
  } catch (error) {
    // "Token is either invalid or has expired." (403): it was consumed between the lookup and now.
    if (error instanceof APIError && error.status === 403) return { status: 'invalid' }
    throw error
  }
  await payload.update({
    collection: 'users',
    id: user.id,
    // Payload only expires the used token; dropping it too keeps the row clean.
    data: { sessions: [], loginAttempts: 0, lockUntil: null, resetPasswordToken: null },
    depth: 0,
    overrideAccess: true,
  })
  return { status: 'reset', email: user.email }
}
