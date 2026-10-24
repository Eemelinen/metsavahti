import { getPayload } from 'payload'
import { z } from 'zod'

import config from '@payload-config'
import { RUNNABLE_JOBS, runJobNow } from '@/lib/jobs/run-now'
import { logger } from '@/lib/logger'
import { isAdminUser } from '@/payload/access'
import { hasValidCronSecret } from '@/payload/jobs/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const querySchema = z.object({ task: z.enum(RUNNABLE_JOBS).default('sync-declarations') })

/**
 * Job entrypoint (`01 §4`, MV-070). Cron sends `Authorization: Bearer $CRON_SECRET`; the admin
 * "Aja haku nyt" button sends the admin's session cookie. `?task=cleanup` runs the weekly
 * cleanup, no `task` the sync workflow. Queues the job, drains the queue in-process and
 * returns a summary with the `runId` that the run's `job_runs` rows carry.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    if (!isAdminUser(user)) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const query = querySchema.safeParse({
    task: new URL(request.url).searchParams.get('task') ?? undefined,
  })
  if (!query.success) return Response.json({ ok: false, error: 'invalid_task' }, { status: 400 })

  const summary = await runJobNow(payload, query.data.task)
  logger.info(summary, 'jobs run via /api/jobs/run')
  return Response.json({ ok: summary.status !== 'error', ...summary })
}
