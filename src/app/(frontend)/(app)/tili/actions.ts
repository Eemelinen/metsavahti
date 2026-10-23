'use server'

import { getPayload } from 'payload'

import config from '@payload-config'
import {
  type ProfileField,
  type ProfileFieldErrors,
  fieldErrorsOf,
  profileFormSchema,
} from '@/lib/account/account-schema'
import { updateUserProfile } from '@/lib/account/profile'
import { requireUser } from '@/lib/auth/guards'
import { type ActionError, actionResult } from '@/lib/errors'

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
