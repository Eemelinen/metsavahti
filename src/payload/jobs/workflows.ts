import type { WorkflowConfig } from 'payload'

/** The twice-daily pipeline: WFS → cache → match → notify. */
export const syncDeclarationsWorkflow: WorkflowConfig<'sync-declarations'> = {
  slug: 'sync-declarations',
  retries: 0,
  handler: async ({ tasks }) => {
    await tasks['fetch-declarations']('fetch', { input: {} })
    await tasks['match-watch-areas']('match', { input: {} })
    await tasks['send-alerts']('send', { input: {} })
  },
}

export const workflows = [syncDeclarationsWorkflow]
