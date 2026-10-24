import type { WorkflowConfig } from 'payload'

import { scheduledDigestField } from '@/payload/jobs/tasks'

/**
 * The twice-daily pipeline: WFS → cache → match → notify. `scheduledDigest` is fixed when the
 * run is queued (`runJobNow()`), so a retried workflow sends the same digests.
 */
export const syncDeclarationsWorkflow: WorkflowConfig<'sync-declarations'> = {
  slug: 'sync-declarations',
  retries: 0,
  inputSchema: [scheduledDigestField],
  handler: async ({ job, tasks }) => {
    await tasks['fetch-declarations']('fetch', { input: {} })
    await tasks['match-watch-areas']('match', { input: {} })
    await tasks['send-alerts']('send', {
      input: { scheduledDigest: job.input.scheduledDigest ?? null },
    })
  },
}

export const workflows = [syncDeclarationsWorkflow]
