import type { TaskConfig } from 'payload'

import { createJobContext } from '@/lib/jobs/context'
import { fetchDeclarations } from '@/lib/jobs/fetch-declarations'
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
    const output = await fetchDeclarations(createJobContext(req.payload, job.id))
    return { output }
  },
}

export const matchWatchAreasTask: TaskConfig<'match-watch-areas'> = {
  slug: 'match-watch-areas',
  retries: 1,
  outputSchema: [count('matched'), count('alertsCreated')],
  handler: async ({ job, req }) => {
    const output = await matchWatchAreas(createJobContext(req.payload, job.id))
    return { output }
  },
}

export const sendAlertsTask: TaskConfig<'send-alerts'> = {
  slug: 'send-alerts',
  retries: 1,
  outputSchema: [count('emailsSent'), count('emailsFailed'), count('alertsHandled')],
  handler: async ({ job, req }) => {
    const output = await sendAlerts(createJobContext(req.payload, job.id), String(job.id))
    return { output }
  },
}

export const tasks = [fetchDeclarationsTask, matchWatchAreasTask, sendAlertsTask]
