import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * One row per rate-limit key (MV-048, D-021): `key` is `<limiter>:<HMAC of the caller's key>`
 * (`bucketKey()`; the caller's key names a route and an IP, user id or email address, none of
 * which is stored in clear), `hits` the epoch-millisecond timestamps of the requests counted
 * in the current sliding window (oldest first), `expiresAt` when the newest of them leaves
 * the window; a request deletes expired rows when the last sweep in its process is ten minutes
 * old. Only `src/lib/rate-limit.ts` writes it, with raw SQL under a row lock; admins read it.
 */
export const RateLimitBuckets: CollectionConfig = {
  slug: 'rate-limit-buckets',
  labels: { singular: 'Pyyntörajoitus', plural: 'Pyyntörajoitukset' },
  admin: {
    useAsTitle: 'key',
    defaultColumns: ['key', 'expiresAt', 'updatedAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, label: 'Avain' },
    { name: 'hits', type: 'json', required: true, label: 'Pyynnöt (ms)' },
    { name: 'expiresAt', type: 'date', required: true, index: true, label: 'Vanhenee' },
  ],
}
