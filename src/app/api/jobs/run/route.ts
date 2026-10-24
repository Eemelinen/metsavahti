import { getPayload } from 'payload'
import config from '@payload-config'
import { PipelineAlreadyRunning } from '@/lib/jobs/pipeline-lock'
import { runJobNow, runnableJobSchema } from '@/lib/jobs/run-now'
import { logger } from '@/lib/logger'
import { isAdminUser } from '@/payload/access'
import { hasValidCronSecret } from '@/payload/jobs/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Job entrypoint (`01 §4`, MV-070). Cron sends `Authorization: Bearer $CRON_SECRET`; the admin
 * "Aja haku nyt" button sends the admin's session cookie. `?task=cleanup` runs the weekly
 * cleanup, no `task` the sync workflow. Queues the job, drains the queue in-process and
 * returns a summary with the `runId` that the run's `job_runs` rows carry. A sync trigger
 * while another sync run holds the advisory lock gets 409 `already_running` (MV-075).
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  if (!hasValidCronSecret(request.headers.get('authorization'))) {
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    if (!isAdminUser(user)) return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const task = runnableJobSchema.safeParse(
    new URL(request.url).searchParams.get('task') ?? undefined,
  )
  if (!task.success) return Response.json({ ok: false, error: 'invalid_task' }, { status: 400 })

  let summary
  try {
    summary = await runJobNow(payload, task.data)
  } catch (err) {
    if (!(err instanceof PipelineAlreadyRunning)) throw err
    logger.warn({ job: task.data }, 'jobs run refused: a sync run is already in progress')
    return Response.json({ ok: false, error: 'already_running' }, { status: 409 })
  }
  logger.info(summary, 'jobs run via /api/jobs/run')
  return Response.json(summary)
}
