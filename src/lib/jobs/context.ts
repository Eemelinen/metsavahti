import type { Payload } from 'payload'

import { env } from '@/lib/env'
import { type Logger, logger as rootLogger } from '@/lib/logger'
import { type WfsClient, createWfsClient } from '@/lib/wfs/client'

export type JobContext = {
  payload: Payload
  logger: Logger
  wfs: WfsClient
  now: () => Date
}

export function createJobContext(payload: Payload, jobRunId: string | number): JobContext {
  return {
    payload,
    logger: rootLogger.child({ jobRunId: String(jobRunId) }),
    wfs: createWfsClient({ baseUrl: env.WFS_BASE_URL, layer: env.WFS_LAYER }),
    now: () => new Date(),
  }
}
