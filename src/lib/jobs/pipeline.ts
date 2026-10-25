import { JobCancelledError } from 'payload'

import { revalidateAlertBadges } from '@/lib/alerts/badge'
import type { JobContext } from '@/lib/jobs/context'
import {
  type FetchDeclarationsResult,
  fetchDeclarationsStatus,
} from '@/lib/jobs/fetch-declarations'
import { type JobRunOutcome, withJobRun } from '@/lib/jobs/job-runs'
import type { MatchWatchAreasResult } from '@/lib/jobs/match-watch-areas'
import type { SendAlertsResult } from '@/lib/jobs/send-alerts'

/** The three steps of one run; the workflow passes its Payload task calls. */
export type PipelineSteps = {
  fetch: () => Promise<FetchDeclarationsResult>
  match: () => Promise<MatchWatchAreasResult>
  notify: () => Promise<SendAlertsResult>
}

export type PipelineStepStatus = 'succeeded' | 'partial' | 'failed' | 'skipped'

/**
 * The `stats` of the run's `pipeline` row: how each step ended and the headline counters of
 * the steps that returned (0 for a step that failed or was skipped; its own row has the error).
 */
export type PipelineSummary = {
  fetch: Extract<PipelineStepStatus, 'succeeded' | 'partial' | 'failed'>
  match: Extract<PipelineStepStatus, 'succeeded' | 'failed'>
  notify: Extract<PipelineStepStatus, 'succeeded' | 'failed' | 'skipped'>
  requests: number
  features: number
  inserted: number
  updated: number
  removed: number
  failedBboxes: number
  alertsCreated: number
  emailsSent: number
  emailsFailed: number
}

/**
 * The run as a whole: `failed` when matching or sending failed (nothing new reached anyone),
 * `partial` when only the fetch failed or was partial (matching and sending ran on the cached
 * declarations), else `succeeded`.
 */
export function pipelineStatus(summary: PipelineSummary): JobRunOutcome {
  if (summary.match !== 'succeeded' || summary.notify !== 'succeeded') return 'failed'
  return summary.fetch === 'succeeded' ? 'succeeded' : 'partial'
}

type Attempt<T> = { ok: true; output: T } | { ok: false; error: unknown }

/**
 * One `sync-declarations` run (`01 §4`, MV-075): fetch → match → notify in order, under the
 * workflow's `runId`, with a `pipeline` row in `job_runs` summarising the steps. A failed
 * fetch does not stop the run (the cache from earlier runs is still matched and pending
 * alerts still go out); a failed match skips notify. Afterwards the nav badge of every
 * account that got an alert is revalidated (`alerts:<userId>`, MV-083). When any step failed,
 * its error is rethrown after the summary is written, so Payload marks the job failed.
 */
export async function runPipeline(ctx: JobContext, steps: PipelineSteps): Promise<PipelineSummary> {
  const errors: unknown[] = []
  // Payload stamps `createdAt` with this process's clock; not `ctx.now()`, which tests may fix.
  const startedAt = new Date()
  async function attempt<T>(step: string, fn: () => Promise<T>): Promise<Attempt<T>> {
    try {
      return { ok: true, output: await fn() }
    } catch (error) {
      if (error instanceof JobCancelledError) throw error
      ctx.logger.error({ err: error, step }, 'pipeline step failed')
      errors.push(error)
      return { ok: false, error }
    }
  }

  const summary = await withJobRun(
    ctx,
    'pipeline',
    async (): Promise<PipelineSummary> => {
      const fetch = await attempt('fetch-declarations', steps.fetch)
      const match = await attempt('match-watch-areas', steps.match)
      const notify = match.ok ? await attempt('send-alerts', steps.notify) : null
      const fetched = fetch.ok ? fetch.output : null
      const matched = match.ok ? match.output : null
      const sent = notify?.ok ? notify.output : null
      return {
        fetch: fetched ? fetchDeclarationsStatus(fetched) : 'failed',
        match: matched ? 'succeeded' : 'failed',
        notify: notify === null ? 'skipped' : sent ? 'succeeded' : 'failed',
        requests: fetched?.requests ?? 0,
        features: fetched?.features ?? 0,
        inserted: fetched?.inserted ?? 0,
        updated: fetched?.updated ?? 0,
        removed: fetched?.removed ?? 0,
        failedBboxes: fetched?.failedBboxes ?? 0,
        alertsCreated: matched?.alertsCreated ?? 0,
        emailsSent: sent?.emailsSent ?? 0,
        emailsFailed: sent?.emailsFailed ?? 0,
      }
    },
    pipelineStatus,
  )
  await revalidateAlertBadges(ctx.payload, startedAt, ctx.logger)
  if (errors.length > 0) throw errors[0]
  return summary
}
