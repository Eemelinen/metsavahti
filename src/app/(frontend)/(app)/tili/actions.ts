'use server'

import { getPayload } from 'payload'

import config from '@payload-config'
import {
  type ChangeEmailFormValues,
  type ProfileField,
  type ProfileFieldErrors,
  fieldErrorsOf,
  changeEmailFormSchema,
  profileFormSchema,
} from '@/lib/account/account-schema'
import { requestEmailChange } from '@/lib/account/email-change'
import { updateUserProfile } from '@/lib/account/profile'
import { requireUser } from '@/lib/auth/guards'
import { type ActionError, RateLimited, actionResult } from '@/lib/errors'
import { fi } from '@/i18n/fi'

export type UpdateProfileActionResult =
  | { ok: true; fieldErrors?: undefined; error?: undefined }
  | { ok: false; fieldErrors: ProfileFieldErrors; error?: undefined }
  | { ok: false; error: ActionError; fieldErrors?: undefined }

/**
 * Server Action `updateProfile` (`03-pages.md` `/tili`, E04 MV-051): validate, then save the
 * name, language and time zone of the signed-in user. Which user is decided by the session
 * alone (`requireUser()`); the form carries no id.
 */
export async function updateProfile(input: unknown): Promise<UpdateProfileActionResult> {
  const parsed = profileFormSchema.safeParse(input)
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf<ProfileField>(parsed.error) }
  const result = await actionResult(async () => {
    const user = await requireUser()
    await updateUserProfile(await getPayload({ config }), user, parsed.data)
  })
  return result.ok ? { ok: true } : result
}

export type ChangeEmailActionResult =
  | { ok: true; pendingEmail: string; fieldErrors?: undefined; error?: undefined }
  | {
      ok: false
      fieldErrors: Partial<Record<keyof ChangeEmailFormValues, string>>
      error?: undefined
    }
  | { ok: false; error: ActionError; fieldErrors?: undefined }

/**
 * Server Action `changeEmail` (`/tili` "Vaihda", E04 MV-052): store the new address as pending
 * and send the confirmation link to it and the notice to the current one. The account comes
 * from the session alone; the address changes only when the link is opened.
 */
export async function changeEmail(input: unknown): Promise<ChangeEmailActionResult> {
  const parsed = changeEmailFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf<keyof ChangeEmailFormValues>(parsed.error) }
  }
  const result = await actionResult(async () => {
    const user = await requireUser()
    const outcome = await requestEmailChange(await getPayload({ config }), user, parsed.data.email)
    if (outcome.status === 'limited') throw new RateLimited(outcome.retryAfterSeconds)
    return outcome
  })
  if (!result.ok) return result
  if (result.data.status === 'same') {
    return { ok: false, fieldErrors: { email: fi.account.profile.errors.emailSame } }
  }
  return { ok: true, pendingEmail: result.data.pendingEmail }
}
