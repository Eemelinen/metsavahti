import { getPayload } from 'payload'

import config from '@payload-config'
import { adminRequestDataExport, parseUserId, requireAdmin } from '@/lib/account/admin-gdpr'
import { NotFound, toErrorResponse } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * "Vie käyttäjän tiedot" on the admin's user detail view (MV-098): an admin queues the
 * account's export (the link goes to the account's address) and the job runs before the
 * answer, so the panel shows the outcome on refresh. Admin session only (401 / 403), JSON
 * only like the account's own routes. Logic and the `job_runs` audit row:
 * `lib/account/admin-gdpr.ts`.
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

    const audit = await adminRequestDataExport(payload, admin, userId)
    try {
      await payload.jobs.runByID({ id: audit.jobId })
    } catch (err) {
      logger.error({ err, jobId: audit.jobId }, 'could not run the admin-requested export job')
    }
    return Response.json({ ok: true, data: audit }, { status: 202 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
