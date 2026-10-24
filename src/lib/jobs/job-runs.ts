import type { JobContext } from '@/lib/jobs/context'
import type { JobRun } from '@/payload-types'

export type JobRunTask = JobRun['task']

/**
 * Run one pipeline step and record it in `job_runs` (`01 §3.9`, MV-070): a `running` row
 * before `fn` starts, then `succeeded` with `fn`'s result as `stats`, or `failed` with the
 * error message. The error is rethrown so Payload's retries still apply; every attempt
 * gets its own row. The rows are written outside the task's transaction, so a failed
 * attempt stays recorded.
 */
export async function withJobRun<T extends Record<string, unknown>>(
  ctx: JobContext,
  task: JobRunTask,
  fn: () => Promise<T>,
): Promise<T> {
  const { payload, logger, now, runId } = ctx
  const run = await payload.create({
    collection: 'job-runs',
    data: { task, runId, startedAt: now().toISOString(), status: 'running' },
    overrideAccess: true,
  })

  let stats: T
  try {
    stats = await fn()
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    try {
      await payload.update({
        collection: 'job-runs',
        id: run.id,
        data: { status: 'failed', finishedAt: now().toISOString(), error },
        overrideAccess: true,
      })
    } catch (writeErr) {
      logger.error({ err: writeErr, task }, 'could not record the failed job run')
    }
    throw err
  }

  await payload.update({
    collection: 'job-runs',
    id: run.id,
    data: { status: 'succeeded', finishedAt: now().toISOString(), stats },
    overrideAccess: true,
  })
  return stats
}
