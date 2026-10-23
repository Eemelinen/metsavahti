import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * Previous hashes and attributes of a declaration, written by `fetch-declarations`
 * whenever an upsert finds a changed `geomHash` or `attrHash` (`01 §3.3`, MV-033).
 * Read-only for admins; the weekly cleanup (`01 §4.4`) prunes rows older than a year.
 */
export const DeclarationRevisions: CollectionConfig = {
  slug: 'declaration-revisions',
  labels: { singular: 'Ilmoituksen versio', plural: 'Ilmoitusten versiot' },
  admin: {
    defaultColumns: ['declaration', 'changedAt', 'prevGeomHash', 'prevAttrHash'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  fields: [
    {
      name: 'declaration',
      type: 'relationship',
      relationTo: 'declarations',
      required: true,
      index: true,
      label: 'Ilmoitus',
    },
    { name: 'prevGeomHash', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'prevAttrHash', type: 'text', required: true, admin: { readOnly: true } },
    {
      name: 'prevRawAttributes',
      type: 'json',
      label: 'Aiemmat WFS-attribuutit',
      admin: { readOnly: true },
    },
    {
      name: 'changedAt',
      type: 'date',
      required: true,
      index: true,
      label: 'Muuttunut',
      admin: { readOnly: true },
    },
  ],
}
