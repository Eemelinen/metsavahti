import type { TaskConfig } from 'payload'

import { retention } from '@/config/retention'
import { cleanup } from '@/lib/jobs/cleanup'
import { createJobContext } from '@/lib/jobs/context'
import { runDataExport } from '@/lib/jobs/export'
import { fetchDeclarations } from '@/lib/jobs/fetch-declarations'
import { withJobRun } from '@/lib/jobs/job-runs'
import { matchWatchAreas } from '@/lib/jobs/match-watch-areas'
import { sendAlerts } from '@/lib/jobs/send-alerts'

const count = (name: string) => ({ name, type: 'number' as const, required: true })

export const fetchDeclarationsTask: TaskConfig<'fetch-declarations'> = {
  slug: 'fetch-declarations',
  retries: 2,
  outputSchema: [
    count('watchAreas'),
    count('fetched'),
    count('created'),
    count('updated'),
    count('revisions'),
  ],
  handler: async ({ job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'fetch-declarations', () => fetchDeclarations(ctx))
    return { output }
  },
}

export const matchWatchAreasTask: TaskConfig<'match-watch-areas'> = {
  slug: 'match-watch-areas',
  retries: 1,
  outputSchema: [count('matched'), count('alertsCreated')],
  handler: async ({ job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'match-watch-areas', () => matchWatchAreas(ctx))
    return { output }
  },
}

export const sendAlertsTask: TaskConfig<'send-alerts'> = {
  slug: 'send-alerts',
  retries: 1,
  outputSchema: [count('emailsSent'), count('emailsFailed'), count('alertsHandled')],
  handler: async ({ job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'send-alerts', () => sendAlerts(ctx, ctx.runId))
    return { output }
  },
}

/** Weekly retention sweep (`01 §4.4`), queued by `POST /api/jobs/run?task=cleanup`. */
export const cleanupTask: TaskConfig<'cleanup'> = {
  slug: 'cleanup',
  retries: 1,
  outputSchema: Object.keys(retention).map(count),
  handler: async ({ job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'cleanup', () => cleanup(ctx))
    return { output }
  },
}

/**
 * One account export (`01 §4.5`, MV-093), queued by `POST /api/account/export`. No retries: a
 * failure marks the request `failed` and the person can ask again from `/tili/tietosuoja`.
 */
export const exportTask: TaskConfig<'export'> = {
  slug: 'export',
  retries: 0,
  inputSchema: [{ name: 'requestId', type: 'number', required: true }],
  outputSchema: [count('files'), count('bytes'), count('emailsSent')],
  handler: async ({ input, job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'export', () => runDataExport(ctx, input.requestId))
    return { output }
  },
}

export const tasks = [
  fetchDeclarationsTask,
  matchWatchAreasTask,
  sendAlertsTask,
  cleanupTask,
  exportTask,
]
