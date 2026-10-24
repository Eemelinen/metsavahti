import type { Payload } from 'payload'

import { pipelineHealth } from '@/config/pipeline'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { MetsakeskusWfsClient, type WfsClient } from '@/lib/wfs/client'
import type { JobRun } from '@/payload-types'

export type LastPipelineRun = Pick<
  JobRun,
  'runId' | 'status' | 'startedAt' | 'finishedAt' | 'stats'
>

export type PipelineHealth = {
  /** The newest `pipeline` row of `job_runs`, `null` before the first run. */
  lastPipelineRun: LastPipelineRun | null
  /** No run yet, or the last one finished (or, still running, started) over 14 h ago. */
  stale: boolean
}

/**
 * The pipeline part of `/api/health` (`01 §10`, MV-075): the last `sync-declarations` run's
 * summary row (`lib/jobs/pipeline.ts`) and whether it is too old. A `partial` or `failed`
 * run is reported as it is; the monitor reads `status`. A database that cannot answer yet
 * (the e2e server is polled before its migrations run) reads as no run: the liveness check
 * is the PostGIS query, not this one.
 */
export async function pipelineHealthAt(payload: Payload, now: Date): Promise<PipelineHealth> {
  let run: JobRun | undefined
  try {
    const { docs } = await payload.find({
      collection: 'job-runs',
      where: { task: { equals: 'pipeline' } },
      sort: '-startedAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    run = docs[0]
  } catch (err) {
    logger.warn({ err }, 'health: could not read the last pipeline run')
  }
  if (!run) return { lastPipelineRun: null, stale: true }
  const at = new Date(run.finishedAt ?? run.startedAt).getTime()
  return {
    lastPipelineRun: {
      runId: run.runId ?? null,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? null,
      stats: run.stats ?? null,
    },
    stale: now.getTime() - at > pipelineHealth.staleAfterMs,
  }
}

/** `?deep=1`: one GetCapabilities request without retries; any 2xx answer counts as reachable. */
export async function isWfsReachable(
  wfs: WfsClient = new MetsakeskusWfsClient({
    baseUrl: env.WFS_BASE_URL,
    layer: env.WFS_LAYER,
    timeoutMs: pipelineHealth.wfsTimeoutMs,
    retries: 0,
  }),
): Promise<boolean> {
  try {
    await wfs.getCapabilitiesXml()
    return true
  } catch (err) {
    logger.warn({ err }, 'health: WFS GetCapabilities failed')
    return false
  }
}
