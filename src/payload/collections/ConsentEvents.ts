import { APIError, type CollectionConfig } from 'payload'

import { truncateIp } from '@/lib/privacy/ip'
import { isAdmin, isAdminOrOwner } from '@/payload/access'

const deny = () => false

const appendOnly = () => {
  throw new APIError('Consent events are append-only', 403)
}

/**
 * Audit trail of every consent decision (`01 §3.7`, `01 §8`, MV-035). Append-only: no
 * update or delete through access control, and the hooks reject them even for the Local
 * API with `overrideAccess` so no code path can rewrite history. `user` is nullable so
 * account deletion can keep the rows with the user cleared (`01 §4.6`). The IP is reduced
 * to its network prefix before it is stored.
 */
export const ConsentEvents: CollectionConfig = {
  slug: 'consent-events',
  labels: { singular: 'Suostumustapahtuma', plural: 'Suostumustapahtumat' },
  admin: {
    defaultColumns: ['user', 'kind', 'version', 'granted', 'createdAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdminOrOwner('user'),
    create: isAdmin,
    update: deny,
    delete: deny,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && 'ip' in data) data.ip = truncateIp(data.ip)
        return data
      },
    ],
    beforeChange: [
      ({ operation }) => {
        if (operation === 'update') appendOnly()
      },
    ],
    beforeDelete: [appendOnly],
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', index: true, label: 'Käyttäjä' },
    {
      name: 'kind',
      type: 'select',
      required: true,
      label: 'Laji',
      options: [
        { label: 'Käyttöehdot', value: 'terms' },
        { label: 'Tietosuoja', value: 'privacy' },
        { label: 'Markkinointi', value: 'marketing' },
        { label: 'Evästeet', value: 'cookies' },
      ],
    },
    { name: 'version', type: 'text', required: true, label: 'Versio' },
    { name: 'granted', type: 'checkbox', required: true, defaultValue: false, label: 'Annettu' },
    { name: 'ip', type: 'text', label: 'IP (verkko-osa)' },
    { name: 'userAgent', type: 'text', label: 'Selain' },
  ],
}
