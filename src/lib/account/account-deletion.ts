import type { Payload } from 'payload'

import { fi } from '@/i18n/fi'
import type {
  DeleteAccountFieldErrors,
  DeleteAccountFormValues,
} from '@/lib/account/account-schema'
import { verifyPassword } from '@/lib/account/password-change'
import { createRateLimiter } from '@/lib/rate-limit'
import type { User } from '@/payload-types'

/**
 * Deletion attempts per account: five per 15 minutes, every attempt counted, so a stolen
 * session cannot be used to guess the password here either (like `passwordChangeLimiter`).
 */
export const accountDeletionLimiter = createRateLimiter({
  name: 'account-delete',
  limit: 5,
  windowMs: 15 * 60 * 1000,
})

export type AccountDeletionOutcome =
  /** The account is stamped, every session has ended and the `delete-account` job is queued. */
  | { status: 'queued'; jobId: string }
  /** Wrong password. */
  | { status: 'rejected'; fieldErrors: DeleteAccountFieldErrors }
  /** Over `accountDeletionLimiter`. */
  | { status: 'limited'; retryAfterSeconds: number }

/**
 * `POST /api/account/delete` (`01 §6`, E08 MV-094): re-check the password, then
 * `startAccountDeletion()`. The caller runs the queued `delete-account` job
 * (`lib/jobs/delete-account.ts`); the cron's queue drain (`POST /api/jobs/run`) picks it up
 * if that fails.
 */
export async function requestAccountDeletion(
  payload: Payload,
  user: Pick<User, 'id'>,
  { password }: Pick<DeleteAccountFormValues, 'password'>,
  now: Date = new Date(),
): Promise<AccountDeletionOutcome> {
  const limit = await accountDeletionLimiter.check(String(user.id))
  if (!limit.allowed) return { status: 'limited', retryAfterSeconds: limit.retryAfterSeconds }

  const stored = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  if (!(await verifyPassword(stored, password))) {
    return {
      status: 'rejected',
      fieldErrors: { password: fi.account.deleteAccount.errors.passwordWrong },
    }
  }

  return { status: 'queued', jobId: await startAccountDeletion(payload, stored, now) }
}

/**
 * The deletion itself, once the request is accepted (the account's password above, or an
 * admin acting on a support request, `lib/account/admin-gdpr.ts`): stamp `deletedAt` (from
 * here on the Users `beforeLogin` hook refuses every login), end every session of the account
 * so no device stays signed in, and queue the `delete-account` job. Returns the job id.
 */
export async function startAccountDeletion(
  payload: Payload,
  user: Pick<User, 'id' | 'deletedAt'>,
  now: Date = new Date(),
): Promise<string> {
  if (!user.deletedAt) {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { deletedAt: now.toISOString() },
      depth: 0,
      overrideAccess: true,
    })
  }
  // Every session ends, this one included; the same sessions-only write as `endSession()`.
  await payload.db.updateOne({
    collection: 'users',
    id: user.id,
    data: { sessions: [], updatedAt: null },
    returning: false,
  })
  const job = await payload.jobs.queue({ task: 'delete-account', input: { userId: user.id } })
  return String(job.id)
}
