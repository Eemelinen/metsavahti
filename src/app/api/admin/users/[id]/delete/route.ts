import { getPayload } from 'payload'

import config from '@payload-config'
import { adminRequestAccountDeletion, parseUserId, requireAdmin } from '@/lib/account/admin-gdpr'
import { NotFound, toErrorResponse } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * "Poista käyttäjän tili" on the admin's user detail view (MV-098): an admin deletes an
 * account for a support request. Every session of the account ends, the `delete-account` job
 * is queued and run before the answer (as `POST /api/account/delete` does); if the run fails
 * it stays queued for the cron's queue drain. Admin session only (401 / 403), JSON only; admin
 * accounts are refused (403). Logic and the `job_runs` audit row: `lib/account/admin-gdpr.ts`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return Response.json({ ok: false, error: 'unsupported_media_type' }, { status: 415 })
    }
    const payload = await getPayload({ config })
    const admin = await requireAdmin(payload, request.headers)
    const userId = parseUserId((await params).id)
    if (userId === null) throw new NotFound()

    const audit = await adminRequestAccountDeletion(payload, admin, userId)
    try {
      await payload.jobs.runByID({ id: audit.jobId })
    } catch (err) {
      logger.error(
        { err, jobId: audit.jobId },
        'could not run the admin-requested delete-account job',
      )
    }
    return Response.json({ ok: true, data: audit })
  } catch (error) {
    return toErrorResponse(error)
  }
}
