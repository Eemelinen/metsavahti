import { getPayload } from 'payload'

import config from '@payload-config'
import { logger } from '@/lib/logger'
import { hasValidCronSecret } from '@/payload/jobs/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Cron entrypoint. `Authorization: Bearer $CRON_SECRET`.
 * Queues the sync workflow and drains the queue in-process, returning a summary.
 */
export async function POST(request: Request) {
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  const job = await payload.jobs.queue({ workflow: 'sync-declarations', input: {} })
  const started = Date.now()
  const result = await payload.jobs.run({ allQueues: true })
  const durationMs = Date.now() - started

  const status = result.jobStatus?.[String(job.id)]?.status ?? 'unknown'
  logger.info({ jobId: job.id, status, durationMs }, 'jobs run via cron endpoint')

  return Response.json({
    ok: status !== 'error',
    jobId: job.id,
    status,
    durationMs,
    remainingJobs: result.remainingJobsFromQueried,
  })
}
