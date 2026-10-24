import type { Payload } from 'payload'

import { env } from '@/lib/env'
import { type Logger, logger as rootLogger } from '@/lib/logger'
import { type WfsClient, createWfsClient } from '@/lib/wfs/client'

export type JobContext = {
  payload: Payload
  /** The Payload job id: shared by the steps of one workflow run, stored on `job_runs.runId`. */
  runId: string
  logger: Logger
  wfs: WfsClient
  now: () => Date
}

export function createJobContext(payload: Payload, jobRunId: string | number): JobContext {
  return {
    payload,
    runId: String(jobRunId),
    logger: rootLogger.child({ jobRunId: String(jobRunId) }),
    wfs: createWfsClient({ baseUrl: env.WFS_BASE_URL, layer: env.WFS_LAYER }),
    now: () => new Date(),
  }
}
