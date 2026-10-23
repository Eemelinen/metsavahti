'use server'

import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { resetUserPassword } from '@/lib/auth/password-reset'
import {
  AFTER_RESET_PATH,
  type ResetPasswordField,
  type ResetPasswordFieldErrors,
  resetPasswordFormSchema,
} from '@/lib/auth/password-reset-schema'
import { type ActionError, actionResult } from '@/lib/errors'

/** What the `resetPassword` Server Action returns when it does not redirect. */
export type ResetPasswordActionResult =
  | { ok: false; fieldErrors: ResetPasswordFieldErrors; invalid?: undefined; error?: undefined }
  /** The link is used, expired or unknown; the form gives way to the "expired or used" state. */
  | { ok: false; invalid: true; fieldErrors?: undefined; error?: undefined }
  | { ok: false; error: ActionError; fieldErrors?: undefined; invalid?: undefined }

/**
 * Server Action `resetPassword` (E03 MV-045, `03-pages.md` `/uusi-salasana`): validate
 * (length and match here, the zxcvbn rule inside `resetUserPassword` once the token has
 * named the account), set the password, end every session of the account and send the
 * person to `/kirjaudu` with the success banner. No cookie is set: the new password is
 * typed once more at the login, so the reset never turns a leaked link into a session.
 * There is no per-IP limiter: the token is 160 random bits, and guessing it is not a
 * practical attack (D-015 keeps the per-route keys for MV-048).
 */
export async function resetPassword(input: unknown): Promise<ResetPasswordActionResult> {
  const parsed = resetPasswordFormSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: ResetPasswordFieldErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as ResetPasswordField | undefined
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
    }
    return { ok: false, fieldErrors }
  }
  const { token, password } = parsed.data

  const payload = await getPayload({ config })
  const result = await actionResult(() => resetUserPassword(payload, { token, password }))
  if (!result.ok) return result
  const outcome = result.data
  if (outcome.status === 'invalid') return { ok: false, invalid: true }
  if (outcome.status === 'weak') return { ok: false, fieldErrors: outcome.fieldErrors }
  redirect(AFTER_RESET_PATH)
}
