import type { Payload } from 'payload'

/** What `POST /api/jobs/run?task=` and `pnpm jobs:run [task]` can start (00-deviations D8). */
export const RUNNABLE_JOBS = ['sync-declarations', 'cleanup'] as const
export type RunnableJob = (typeof RUNNABLE_JOBS)[number]

export type JobRunSummary = {
  /** The queued job's id; the `job_runs` rows of this run carry it as `runId`. */
  runId: string
  job: RunnableJob
  /** Payload's result for the job (`success`, `error`, …) or `unknown` if it did not run. */
  status: string
  durationMs: number
  remainingJobs: number
}

/**
 * Queue the twice-daily `sync-declarations` workflow or the weekly `cleanup` task and drain
 * the queue in this process (`01 §4`). The cron endpoint, the admin button and the CLI script
 * all come through here, so they behave the same.
 */
export async function runJobNow(payload: Payload, job: RunnableJob): Promise<JobRunSummary> {
  const queued =
    job === 'cleanup'
      ? await payload.jobs.queue({ task: 'cleanup', input: {} })
      : await payload.jobs.queue({ workflow: 'sync-declarations', input: {} })
  const started = Date.now()
  const result = await payload.jobs.run({ allQueues: true })
  return {
    runId: String(queued.id),
    job,
    status: result.jobStatus?.[String(queued.id)]?.status ?? 'unknown',
    durationMs: Date.now() - started,
    remainingJobs: result.remainingJobsFromQueried,
  }
}
