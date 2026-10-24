import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * One row per task execution (`01 §3.9`, `01 §10`, MV-035): what ran, when, with which
 * counters. Admin read-only; every task writes its rows through `withJobRun()`
 * (`lib/jobs/job-runs.ts`, MV-070), `runId` ties the steps of one workflow run together and
 * the weekly cleanup purges rows older than 90 days. `task` uses the repository's task slugs
 * (`send-alerts`, 00-deviations D8). The list view carries the admin "Aja haku nyt" button.
 */
export const JobRuns: CollectionConfig = {
  slug: 'job-runs',
  labels: { singular: 'Tehtäväajo', plural: 'Tehtäväajot' },
  admin: {
    defaultColumns: ['task', 'status', 'startedAt', 'finishedAt', 'runId'],
    group: 'Metsävahti',
    components: {
      beforeListTable: ['/components/admin/run-pipeline-button#RunPipelineButton'],
    },
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  indexes: [{ fields: ['task', 'startedAt'] }],
  fields: [
    {
      name: 'task',
      type: 'select',
      required: true,
      label: 'Tehtävä',
      options: [
        { label: 'fetch-declarations', value: 'fetch-declarations' },
        { label: 'match-watch-areas', value: 'match-watch-areas' },
        { label: 'send-alerts', value: 'send-alerts' },
        { label: 'cleanup', value: 'cleanup' },
        { label: 'export', value: 'export' },
        { label: 'delete-account', value: 'delete-account' },
      ],
    },
    {
      name: 'runId',
      type: 'text',
      index: true,
      label: 'Ajon tunnus',
      admin: { description: 'Payloadin jonotehtävän id; sama kaikilla saman ajon vaiheilla.' },
    },
    { name: 'startedAt', type: 'date', required: true, index: true, label: 'Alkoi' },
    { name: 'finishedAt', type: 'date', label: 'Päättyi' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'running',
      label: 'Tila',
      options: [
        { label: 'Käynnissä', value: 'running' },
        { label: 'Onnistui', value: 'succeeded' },
        { label: 'Epäonnistui', value: 'failed' },
      ],
    },
    { name: 'stats', type: 'json', label: 'Laskurit' },
    { name: 'error', type: 'textarea', label: 'Virhe' },
  ],
}
