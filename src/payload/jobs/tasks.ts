import type { Field, TaskConfig } from 'payload'

import { retention } from '@/config/retention'
import { cleanup } from '@/lib/jobs/cleanup'
import { createJobContext } from '@/lib/jobs/context'
import { runAccountDeletion } from '@/lib/jobs/delete-account'
import { runDataExport } from '@/lib/jobs/export'
import { fetchDeclarations, fetchDeclarationsStatus } from '@/lib/jobs/fetch-declarations'
import { withJobRun } from '@/lib/jobs/job-runs'
import { matchWatchAreas } from '@/lib/jobs/match-watch-areas'
import { sendAlerts } from '@/lib/jobs/send-alerts'

const count = (name: string) => ({ name, type: 'number' as const, required: true })

/** The digest a pipeline run sends (`01 §4.3`); empty = immediate emails only. */
export const scheduledDigestField: Field = {
  name: 'scheduledDigest',
  type: 'select',
  options: ['daily', 'weekly'],
}

export const fetchDeclarationsTask: TaskConfig<'fetch-declarations'> = {
  slug: 'fetch-declarations',
  retries: 2,
  outputSchema: [
    count('watchAreas'),
    count('bboxes'),
    count('failedBboxes'),
    count('requests'),
    count('features'),
    count('inserted'),
    count('updated'),
    count('removed'),
  ],
  handler: async ({ job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(
      ctx,
      'fetch-declarations',
      () => fetchDeclarations(ctx),
      fetchDeclarationsStatus,
    )
    return { output }
  },
}

export const matchWatchAreasTask: TaskConfig<'match-watch-areas'> = {
  slug: 'match-watch-areas',
  retries: 1,
  outputSchema: [
    count('watchAreas'),
    count('matched'),
    count('alertsCreated'),
    count('new'),
    count('geometryChanged'),
    count('attributesChanged'),
    count('removed'),
  ],
  handler: async ({ job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'match-watch-areas', () => matchWatchAreas(ctx))
    return { output }
  },
}

/** `scheduledDigest` comes from the workflow input (`scheduledDigestFor()` at queue time). */
export const sendAlertsTask: TaskConfig<'send-alerts'> = {
  slug: 'send-alerts',
  retries: 1,
  inputSchema: [scheduledDigestField],
  outputSchema: [
    count('emailsSent'),
    count('emailsFailed'),
    count('alertsHandled'),
    count('alertsDeferred'),
    count('alertsGivenUp'),
  ],
  handler: async ({ input, job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'send-alerts', () =>
      sendAlerts(ctx, ctx.runId, { scheduledDigest: input.scheduledDigest ?? null }),
    )
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

/**
 * One account deletion (`01 §4.6`, MV-094), queued by `POST /api/account/delete` once the
 * password checked out. Retried: the steps are idempotent and the email is sent once per job,
 * so a retry finishes a deletion that a database error interrupted.
 */
export const deleteAccountTask: TaskConfig<'delete-account'> = {
  slug: 'delete-account',
  retries: 3,
  inputSchema: [{ name: 'userId', type: 'number', required: true }],
  outputSchema: [
    count('emailsSent'),
    count('alerts'),
    count('watchAreaDeclarations'),
    count('watchAreas'),
    count('notifications'),
    count('consentEvents'),
    count('dataExports'),
    count('sessions'),
    count('users'),
  ],
  handler: async ({ input, job, req }) => {
    const ctx = createJobContext(req.payload, job.id)
    const output = await withJobRun(ctx, 'delete-account', () =>
      runAccountDeletion(ctx, input.userId),
    )
    return { output }
  },
}

export const tasks = [
  fetchDeclarationsTask,
  matchWatchAreasTask,
  sendAlertsTask,
  cleanupTask,
  exportTask,
  deleteAccountTask,
]
