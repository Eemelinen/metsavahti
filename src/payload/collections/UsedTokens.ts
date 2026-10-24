import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * The `jti` of every single-use signed link that has been used (`src/lib/tokens.ts`); today the
 * per-area unsubscribe link of the alert emails (MV-073, D-039). A unique `jti` makes a second
 * use fail even when two clicks race. No user reference: the random `jti` says nothing about
 * the account, so the row survives account deletion without being personal data. `expiresAt`
 * is when the link would have expired anyway; after it the row only blocks a dead link.
 * `lockDocuments: false` keeps the table out of `payload_locked_documents_rels` (nobody edits
 * these rows in the admin, and the generated `down` stays droppable, PROGRESS follow-up 30).
 */
export const UsedTokens: CollectionConfig = {
  slug: 'used-tokens',
  labels: { singular: 'Käytetty linkki', plural: 'Käytetyt linkit' },
  lockDocuments: false,
  admin: {
    useAsTitle: 'jti',
    defaultColumns: ['purpose', 'jti', 'createdAt', 'expiresAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  fields: [
    { name: 'jti', type: 'text', required: true, unique: true, label: 'Tunniste' },
    {
      name: 'purpose',
      type: 'select',
      required: true,
      label: 'Käyttötarkoitus',
      options: [{ label: 'Ilmoitusten lopetus', value: 'unsub' }],
    },
    { name: 'expiresAt', type: 'date', required: true, index: true, label: 'Vanhenee' },
  ],
}
