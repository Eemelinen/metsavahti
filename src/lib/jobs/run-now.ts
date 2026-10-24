import type { Payload } from 'payload'
import { z } from 'zod'

import { withPipelineLock } from '@/lib/jobs/pipeline-lock'
import { scheduledDigestFor } from '@/lib/notifications/digest-schedule'

/** What `POST /api/jobs/run?task=` and `pnpm jobs:run [task]` can start (00-deviations D8). */
export const RUNNABLE_JOBS = ['sync-declarations', 'cleanup'] as const
export type RunnableJob = (typeof RUNNABLE_JOBS)[number]

/** The `task` query parameter / CLI argument: missing → the sync workflow, unknown → an error. */
export const runnableJobSchema = z.enum(RUNNABLE_JOBS).default('sync-declarations')

export type JobRunSummary = {
  /** `true` only when Payload reports the job as `success`. */
  ok: boolean
  /** The queued job's id; the `job_runs` rows of this run carry it as `runId`. */
  runId: string
  job: RunnableJob
  /** Payload's result for the job (`success`, `error`, `error-reached-max-retries`) or `unknown` if it did not run. */
  status: string
  durationMs: number
  remainingJobs: number
}

/**
 * Queue the twice-daily `sync-declarations` workflow or the weekly `cleanup` task and drain
 * the queue in this process (`01 §4`). The cron endpoint, the admin button and the CLI script
 * all come through here, so they behave the same. The sync run's digest (`01 §4.3`) is read
 * from the Finnish time at queue time: a morning run started by hand sends the digests too.
 * The sync run holds the pipeline's advisory lock while it is queued and drained, so a
 * second trigger during a run throws `PipelineAlreadyRunning` and queues nothing (MV-075).
 */
export async function runJobNow(payload: Payload, job: RunnableJob): Promise<JobRunSummary> {
  return job === 'cleanup'
    ? queueAndRun(payload, job)
    : withPipelineLock(payload, () => queueAndRun(payload, job))
}

async function queueAndRun(payload: Payload, job: RunnableJob): Promise<JobRunSummary> {
  const queued =
    job === 'cleanup'
      ? await payload.jobs.queue({ task: 'cleanup', input: {} })
      : await payload.jobs.queue({
          workflow: 'sync-declarations',
          input: { scheduledDigest: scheduledDigestFor(new Date()) },
        })
  const started = Date.now()
  const result = await payload.jobs.run({ allQueues: true })
  const status = result.jobStatus?.[String(queued.id)]?.status ?? 'unknown'
  return {
    ok: status === 'success',
    runId: String(queued.id),
    job,
    status,
    durationMs: Date.now() - started,
    remainingJobs: result.remainingJobsFromQueried,
  }
}
