import { pbkdf2, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

import type { Payload } from 'payload'

import { fi } from '@/i18n/fi'
import type {
  ChangePasswordFieldErrors,
  ChangePasswordFormValues,
} from '@/lib/account/account-schema'
import { endOtherSessions } from '@/lib/account/sessions'
import { scorePassword } from '@/lib/auth/password-strength'
import { passwordUserInputs } from '@/lib/auth/registration-schema'
import { createRateLimiter } from '@/lib/rate-limit'
import type { User } from '@/payload-types'

const copy = fi.account.password.errors
const pbkdf2Async = promisify(pbkdf2)

/**
 * Password changes per account: five per 15 minutes. Every attempt counts, so a stolen
 * session cannot be used to guess the current password (Payload's login lockout does not see
 * these attempts).
 */
export const passwordChangeLimiter = createRateLimiter({
  name: 'password-change',
  limit: 5,
  windowMs: 15 * 60 * 1000,
})

/**
 * Whether `password` is the one Payload stored as `hash` / `salt`. Payload's own check
 * (`authenticateLocalStrategy`: PBKDF2-SHA256, 25 000 rounds, 512 bytes) is not exported, and
 * its login operation would start a session and count towards the lockout, so this repeats
 * it; the integration suite checks the two agree on a password Payload hashed.
 */
export async function verifyPassword(
  stored: { hash?: string | null; salt?: string | null },
  password: string,
): Promise<boolean> {
  if (!stored.hash || !stored.salt) return false
  const actual = await pbkdf2Async(password, stored.salt, 25000, 512, 'sha256')
  const expected = Buffer.from(stored.hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export type PasswordChangeOutcome =
  /** The password changed; `endedSessions` other sessions of the account were ended. */
  | { status: 'changed'; endedSessions: number }
  /** Wrong current password, or a new one zxcvbn rejects. */
  | { status: 'rejected'; fieldErrors: ChangePasswordFieldErrors }
  /** Over `passwordChangeLimiter`. */
  | { status: 'limited'; retryAfterSeconds: number }

/**
 * `/tili/turvallisuus` (E04 MV-051): check the current password, apply the registration
 * strength rule (zxcvbn ≥ 3 with the address penalised), store the new password through
 * Payload (which hashes it) and end every other session of the account, so a device that
 * knew the old password is logged out everywhere. The session that asked (`currentSid`)
 * stays: its token is still valid because its id is still listed.
 */
export async function changeUserPassword(
  payload: Payload,
  user: Pick<User, 'id' | 'email'>,
  currentSid: string | null,
  { currentPassword, newPassword }: ChangePasswordFormValues,
): Promise<PasswordChangeOutcome> {
  const limit = await passwordChangeLimiter.check(String(user.id))
  if (!limit.allowed) return { status: 'limited', retryAfterSeconds: limit.retryAfterSeconds }

  const stored = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  if (!(await verifyPassword(stored, currentPassword))) {
    return { status: 'rejected', fieldErrors: { currentPassword: copy.currentWrong } }
  }
  if (!scorePassword(newPassword, passwordUserInputs(user.email)).acceptable) {
    return { status: 'rejected', fieldErrors: { newPassword: copy.passwordTooWeak } }
  }
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { password: newPassword },
    depth: 0,
    overrideAccess: true,
  })
  return { status: 'changed', endedSessions: await endOtherSessions(payload, user, currentSid) }
}
