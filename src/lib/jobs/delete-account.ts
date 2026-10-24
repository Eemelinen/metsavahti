import { createHash } from 'node:crypto'

import type { Payload, Where } from 'payload'

import { ACCOUNT_DELETED_SUBJECT, renderAccountDeleted } from '@/emails/AccountDeleted'
import { formatSessionTime } from '@/lib/account/sessions'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { env } from '@/lib/env'
import type { JobContext } from '@/lib/jobs/context'
import { emailProvider } from '@/lib/notifications/provider'
import type { User } from '@/payload-types'

/** What one run removed (or anonymised), per collection, as `job_runs.stats`. */
export type AccountDeletionResult = {
  emailsSent: number
  alerts: number
  watchAreaDeclarations: number
  watchAreas: number
  notifications: number
  consentEvents: number
  dataExports: number
  sessions: number
  users: number
}

const NOTHING: AccountDeletionResult = {
  emailsSent: 0,
  alerts: 0,
  watchAreaDeclarations: 0,
  watchAreas: 0,
  notifications: 0,
  consentEvents: 0,
  dataExports: 0,
  sessions: 0,
  users: 0,
}

/**
 * What a deleted account's consent events keep instead of the user: the SHA-256 of the address,
 * trimmed and lower-cased like registration stores it, so a later claim ("I withdrew my
 * consent") can be checked against the address the person gives without keeping the address.
 */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

type OwnedCollection =
  | 'alerts'
  | 'watch-area-declarations'
  | 'watch-areas'
  | 'notification-log'
  | 'data-export-requests'
  | 'user-sessions'

/**
 * Delete the rows `where` matches straight through the database adapter and say how many there
 * were. None of these collections has delete hooks or files, so the Local API's per-document
 * delete would only be slower; `exports` (files) and `users` go through the Local API.
 */
async function deleteRows(
  payload: Payload,
  collection: OwnedCollection,
  where: Where,
): Promise<number> {
  const { totalDocs } = await payload.count({ collection, where, overrideAccess: true })
  if (totalDocs > 0) await payload.db.deleteMany({ collection, where })
  return totalDocs
}

/**
 * The `delete-account` job (`01 §4.6`, E08 MV-094). The password was checked when the person
 * asked (`requestAccountDeletion()`), which also stamped `deletedAt` and ended every session;
 * a user without that stamp is refused, so a stray job cannot delete a live account.
 *
 * 1. Email `AccountDeleted` to the address while it is still known, logged in
 *    `notification-log` without user or address. A retry of the same job (`runId`) finds that
 *    row and does not send again; a failed send fails the job before anything is deleted.
 * 2. Delete in the order of `01 §4.6`: alerts, watch-area declarations, watch areas, the
 *    notification log (rows of the user, and rows sent to the address without a user), consent
 *    events (kept with `user` null and `emailHash`, through the adapter because the collection's
 *    hooks refuse every update), the data exports (requests, then the files through the Local
 *    API), the `user-sessions` rows and the user row (Payload deletes its preferences too).
 *
 * Every step is idempotent, so a retry after a partial run finishes the job; once the user row
 * is gone a retry does nothing. `withJobRun` records the run in `job_runs`.
 */
export async function runAccountDeletion(
  ctx: JobContext,
  userId: number,
): Promise<AccountDeletionResult> {
  const { payload, logger } = ctx
  const user = await payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!user) return NOTHING
  if (!user.deletedAt) throw new Error(`User ${userId} has not asked for deletion`)

  const areaIds = (
    await payload.find({
      collection: 'watch-areas',
      where: { owner: { equals: userId } },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
  ).docs.map((area) => area.id)

  const emailsSent = await sendAccountDeleted(ctx, user, areaIds.length)

  const alerts = await deleteRows(payload, 'alerts', { user: { equals: userId } })
  const watchAreaDeclarations =
    areaIds.length > 0
      ? await deleteRows(payload, 'watch-area-declarations', { watchArea: { in: areaIds } })
      : 0
  const watchAreas = await deleteRows(payload, 'watch-areas', { owner: { equals: userId } })
  const notifications = await deleteRows(payload, 'notification-log', {
    or: [
      { user: { equals: userId } },
      { and: [{ user: { exists: false } }, { recipient: { equals: user.email } }] },
    ],
  })
  const consentEvents = await anonymiseConsentEvents(payload, user)
  const dataExports = await deleteRows(payload, 'data-export-requests', {
    user: { equals: userId },
  })
  await payload.delete({
    collection: 'exports',
    where: { user: { equals: userId } },
    overrideAccess: true,
  })
  const sessions = await deleteRows(payload, 'user-sessions', { user: { equals: userId } })
  await payload.delete({ collection: 'users', id: userId, overrideAccess: true })

  logger.info({ userId }, 'account deleted')
  return {
    emailsSent,
    alerts,
    watchAreaDeclarations,
    watchAreas,
    notifications,
    consentEvents,
    dataExports,
    sessions,
    users: 1,
  }
}

/** Clear `user` and store the address hash on every consent event of the account. */
async function anonymiseConsentEvents(payload: Payload, user: User): Promise<number> {
  const where: Where = { user: { equals: user.id } }
  const { totalDocs } = await payload.count({
    collection: 'consent-events',
    where,
    overrideAccess: true,
  })
  if (totalDocs === 0) return 0
  await payload.db.updateMany({
    collection: 'consent-events',
    where,
    data: { user: null, emailHash: hashEmail(user.email) },
    returning: false,
  })
  return totalDocs
}

/** Step 1: the goodbye email, once per job. Returns how many were sent (0 on a retry). */
async function sendAccountDeleted(
  { payload, logger, runId, now }: JobContext,
  user: User,
  watchAreas: number,
): Promise<number> {
  const { totalDocs: alreadySent } = await payload.count({
    collection: 'notification-log',
    where: { type: { equals: 'account_deleted' }, jobRunId: { equals: runId } },
    overrideAccess: true,
  })
  if (alreadySent > 0) return 0

  const email = await renderAccountDeleted({
    watchAreas,
    deletedAt: formatSessionTime(user.deletedAt!, user.timezone ?? DEFAULT_TIMEZONE),
    baseUrl: env.NEXT_PUBLIC_SERVER_URL,
  })
  await payload.sendEmail({ to: user.email, subject: ACCOUNT_DELETED_SUBJECT, ...email })
  // No user and no address: the row must outlive the account without naming it. A failed write
  // only means a retry could send the email twice, which is better than failing the deletion.
  try {
    await payload.create({
      collection: 'notification-log',
      data: {
        type: 'account_deleted',
        provider: emailProvider(),
        status: 'sent',
        sentAt: now().toISOString(),
        jobRunId: runId,
      },
      overrideAccess: true,
    })
  } catch (err) {
    logger.error({ err, userId: user.id }, 'could not log the account-deleted email')
  }
  return 1
}
