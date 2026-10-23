import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrOwner } from '@/payload/access'

/**
 * A user's request for a copy of their data (`01 §3.8`, MV-035). The `export` job
 * (`01 §4.5`) builds the zip into the `exports` upload collection, links it here and
 * sets `status: ready`; the weekly cleanup expires old requests. Owners read their own
 * requests; the request flow creates them server-side with `overrideAccess`.
 */
export const DataExportRequests: CollectionConfig = {
  slug: 'data-export-requests',
  labels: { singular: 'Tietojen vientipyyntö', plural: 'Tietojen vientipyynnöt' },
  admin: {
    defaultColumns: ['user', 'status', 'expiresAt', 'createdAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdminOrOwner('user'),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Käyttäjä',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      label: 'Tila',
      options: [
        { label: 'Odottaa', value: 'pending' },
        { label: 'Valmis', value: 'ready' },
        { label: 'Vanhentunut', value: 'expired' },
        { label: 'Epäonnistui', value: 'failed' },
      ],
    },
    { name: 'file', type: 'relationship', relationTo: 'exports', label: 'Tiedosto' },
    { name: 'expiresAt', type: 'date', required: true, index: true, label: 'Vanhenee' },
  ],
}
