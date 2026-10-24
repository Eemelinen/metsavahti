import { after } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { requestDataExport } from '@/lib/account/data-export'
import { requireUser } from '@/lib/auth/guards'
import { toErrorResponse } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * "Lataa tietoni" on `/tili/tietosuoja` (`01 §6`, MV-093): queue the account's export and run
 * it right after the response (`after()`), so the email arrives within seconds; if this
 * process dies first, the cron's queue drain runs it. JSON only, like `POST /api/consent`, so
 * a cross-site form cannot trigger it. Logic: `lib/account/data-export.ts`.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return Response.json({ ok: false, error: 'unsupported_media_type' }, { status: 415 })
    }
    const user = await requireUser()
    const payload = await getPayload({ config })
    const { id, jobId } = await requestDataExport(payload, user)
    after(async () => {
      try {
        await payload.jobs.runByID({ id: jobId })
      } catch (err) {
        logger.error({ err, jobId }, 'could not run the export job')
      }
    })
    return Response.json({ ok: true, data: { id, status: 'pending' } }, { status: 202 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
