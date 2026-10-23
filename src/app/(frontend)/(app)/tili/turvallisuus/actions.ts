'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import {
  type ChangePasswordField,
  type ChangePasswordFieldErrors,
  changePasswordFormSchema,
  fieldErrorsOf,
} from '@/lib/account/account-schema'
import { changeUserPassword } from '@/lib/account/password-change'
import { currentSessionId, endOtherSessions } from '@/lib/account/sessions'
import { requireUser } from '@/lib/auth/guards'
import { type ActionError, RateLimited, actionResult } from '@/lib/errors'

export type ChangePasswordActionResult =
  | { ok: true; fieldErrors?: undefined; error?: undefined }
  | { ok: false; fieldErrors: ChangePasswordFieldErrors; error?: undefined }
  | { ok: false; error: ActionError; fieldErrors?: undefined }

/**
 * Server Action `changePassword` (`03-pages.md` `/tili/turvallisuus`, E04 MV-051): the current
 * password is required, the new one must pass the registration rule, and every other session
 * of the account ends; this one stays signed in.
 */
export async function changePassword(input: unknown): Promise<ChangePasswordActionResult> {
  const parsed = changePasswordFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf<ChangePasswordField>(parsed.error) }
  }
  const result = await actionResult(async () => {
    const user = await requireUser()
    const payload = await getPayload({ config })
    const sid = currentSessionId(payload, await headers(), user)
    const outcome = await changeUserPassword(payload, user, sid, parsed.data)
    if (outcome.status === 'limited') throw new RateLimited(outcome.retryAfterSeconds)
    return outcome
  })
  if (!result.ok) return result
  if (result.data.status === 'rejected') return { ok: false, fieldErrors: result.data.fieldErrors }
  return { ok: true }
}

/** Server Action "Kirjaa ulos muista laitteista": end every session of the account but this one. */
export async function logOutOtherSessions() {
  return actionResult(async () => {
    const user = await requireUser()
    const payload = await getPayload({ config })
    const sid = currentSessionId(payload, await headers(), user)
    return { ended: await endOtherSessions(payload, user, sid) }
  })
}
