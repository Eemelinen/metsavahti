import type { WorkflowConfig } from 'payload'

import { createJobContext } from '@/lib/jobs/context'
import { runPipeline } from '@/lib/jobs/pipeline'
import { scheduledDigestField } from '@/payload/jobs/tasks'

/**
 * The twice-daily pipeline: WFS → cache → match → notify (`runPipeline()`, MV-075: a failed
 * fetch still matches and notifies, a failed match skips notify, one `pipeline` summary row).
 * `scheduledDigest` is fixed when the run is queued (`runJobNow()`, which also holds the
 * advisory lock against overlapping runs), so a retried workflow sends the same digests.
 */
export const syncDeclarationsWorkflow: WorkflowConfig<'sync-declarations'> = {
  slug: 'sync-declarations',
  retries: 0,
  inputSchema: [scheduledDigestField],
  handler: async ({ job, req, tasks }) => {
    await runPipeline(createJobContext(req.payload, job.id), {
      fetch: () => tasks['fetch-declarations']('fetch', { input: {} }),
      match: () => tasks['match-watch-areas']('match', { input: {} }),
      notify: () =>
        tasks['send-alerts']('send', {
          input: { scheduledDigest: job.input.scheduledDigest ?? null },
        }),
    })
  },
}

export const workflows = [syncDeclarationsWorkflow]
