import type { Payload } from 'payload'

import { fi } from '@/i18n/fi'
import { startAccountDeletion } from '@/lib/account/account-deletion'
import { type DataExportState, dataExportState, requestDataExport } from '@/lib/account/data-export'
import { Forbidden, NotFound, Unauthorized } from '@/lib/errors'
import { isAdminUser } from '@/payload/access'
import type { ConsentEvent, User } from '@/payload-types'

const t = fi.admin.gdpr

export type AdminGdprAction = 'export' | 'delete-account'

/** The `stats` of an `admin-gdpr` row in `job_runs`: who did what to which account. */
export type AdminGdprAudit = {
  action: AdminGdprAction
  userId: number
  adminId: number
  jobId: string
  requestId?: number
}

export type AdminGdprOverview = {
  consents: ConsentEvent[]
  /** Without the download link: the archive is the account's, only its owner opens it. */
  exportState: Omit<DataExportState, 'downloadUrl'>
}

/**
 * What the admin's user detail view shows (MV-098, `components/admin/user-gdpr-panel.tsx`):
 * the account's consent history from `consent-events`, newest first (as `/tili/tietosuoja`
 * shows it), and its latest export request.
 */
export async function adminGdprOverview(
  payload: Payload,
  userId: number,
  now: Date = new Date(),
): Promise<AdminGdprOverview> {
  const [{ docs: consents }, { downloadUrl: _ownerOnly, ...exportState }] = await Promise.all([
    payload.find({
      collection: 'consent-events',
      where: { user: { equals: userId } },
      sort: '-createdAt',
      depth: 0,
      limit: 100,
      overrideAccess: true,
    }),
    dataExportState(payload, { id: userId }, now),
  ])
  return { consents, exportState }
}

/**
 * The audit entry (`01 §3.9`, MV-098): one `job_runs` row with task `admin-gdpr`, finished at
 * once, under the `runId` of the job the action queued, so the job's own row (`export` or
 * `delete-account`) and this one read together. Ids only, no addresses: the row outlives a
 * deleted account for `retention.jobRuns.days`.
 */
async function recordAdminGdprAction(payload: Payload, audit: AdminGdprAudit, now: Date) {
  const at = now.toISOString()
  await payload.create({
    collection: 'job-runs',
    data: {
      task: 'admin-gdpr',
      runId: audit.jobId,
      startedAt: at,
      finishedAt: at,
      status: 'succeeded',
      stats: audit,
    },
    overrideAccess: true,
  })
}

/**
 * The admin behind an admin-panel request (session cookie, checked by Payload including its
 * CSRF origin check, as `POST /api/jobs/run` does): `Unauthorized` without one, `Forbidden`
 * for any other account.
 */
export async function requireAdmin(payload: Payload, headers: Headers): Promise<User> {
  const { user } = await payload.auth({ headers })
  if (!user) throw new Unauthorized()
  if (!isAdminUser(user)) throw new Forbidden()
  return user
}

/** A user id from a route segment, or `null` when it is not one. */
export function parseUserId(param: string): number | null {
  return /^[1-9]\d{0,9}$/.test(param) ? Number(param) : null
}

async function targetUser(payload: Payload, userId: number): Promise<User> {
  const user = await payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!user) throw new NotFound(t.errors.notFound)
  return user
}

/**
 * "Vie käyttäjän tiedot" (MV-098): an admin queues the account's export for a support request.
 * Same path as "Lataa tietoni" (`requestDataExport()`, one per day): the `ExportReady` link
 * goes to the account's own address, never to the admin. Refused for an account being deleted.
 * The caller runs the queued job.
 */
export async function adminRequestDataExport(
  payload: Payload,
  admin: Pick<User, 'id'>,
  userId: number,
  now: Date = new Date(),
): Promise<AdminGdprAudit> {
  const user = await targetUser(payload, userId)
  if (user.deletedAt) throw new Forbidden(t.errors.beingDeleted)
  const { id: requestId, jobId } = await requestDataExport(payload, user, now)
  const audit: AdminGdprAudit = {
    action: 'export',
    userId: user.id,
    adminId: admin.id,
    jobId,
    requestId,
  }
  await recordAdminGdprAction(payload, audit, now)
  return audit
}

/**
 * "Poista käyttäjän tili" (MV-098): an admin deletes an account for a support request, without
 * its password; the same `startAccountDeletion()` and `delete-account` job as `/tili/poista`
 * (`AccountDeleted` to the account first). Admin accounts are refused, the acting admin's own
 * included, so the instance cannot lose its admins from this button; demote first. The caller
 * runs the queued job.
 */
export async function adminRequestAccountDeletion(
  payload: Payload,
  admin: Pick<User, 'id'>,
  userId: number,
  now: Date = new Date(),
): Promise<AdminGdprAudit> {
  const user = await targetUser(payload, userId)
  if (user.role === 'admin') throw new Forbidden(t.errors.adminAccount)
  const jobId = await startAccountDeletion(payload, user, now)
  const audit: AdminGdprAudit = {
    action: 'delete-account',
    userId: user.id,
    adminId: admin.id,
    jobId,
  }
  await recordAdminGdprAction(payload, audit, now)
  return audit
}
