import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * One row per task execution (`01 §3.9`, `01 §10`, MV-035): what ran, when, with which
 * counters. Admin read-only; the jobs write rows with `overrideAccess` (MV-070) and the
 * weekly cleanup purges rows older than 90 days. `task` uses the repository's task slugs
 * (`send-alerts`, 00-deviations D8).
 */
export const JobRuns: CollectionConfig = {
  slug: 'job-runs',
  labels: { singular: 'Tehtäväajo', plural: 'Tehtäväajot' },
  admin: {
    defaultColumns: ['task', 'status', 'startedAt', 'finishedAt'],
    group: 'Metsävahti',
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
