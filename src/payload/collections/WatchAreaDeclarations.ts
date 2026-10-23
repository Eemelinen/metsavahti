import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * Join / "seen" state between a watch area and a declaration (`01 §3.4`, ticket
 * MV-034). One row per (watchArea, declaration) pair — the unique compound index is
 * what makes `match-watch-areas` idempotent: an alert is created only when a row is
 * inserted or its stored hashes differ from the declaration's current hashes. Written
 * only by the pipeline through the Local API (`overrideAccess`); admins read it in the
 * admin UI, nobody writes it through the REST/GraphQL API. `distanceM` is
 * `ST_Distance` from the watch-area centre to the polygon (0 when the centre is inside).
 */
export const WatchAreaDeclarations: CollectionConfig = {
  slug: 'watch-area-declarations',
  labels: { singular: 'Vahtialueen osuma', plural: 'Vahtialueiden osumat' },
  admin: {
    defaultColumns: ['watchArea', 'declaration', 'distanceM', 'firstMatchedAt', 'lastMatchedAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  indexes: [{ fields: ['watchArea', 'declaration'], unique: true }],
  fields: [
    {
      name: 'watchArea',
      type: 'relationship',
      relationTo: 'watch-areas',
      required: true,
      index: true,
      label: 'Vahtialue',
    },
    {
      name: 'declaration',
      type: 'relationship',
      relationTo: 'declarations',
      required: true,
      index: true,
      label: 'Ilmoitus',
    },
    {
      name: 'firstMatchedAt',
      type: 'date',
      required: true,
      label: 'Osui ensimmäisen kerran',
      admin: { readOnly: true },
    },
    {
      name: 'lastMatchedAt',
      type: 'date',
      required: true,
      label: 'Osui viimeksi',
      admin: { readOnly: true },
    },
    {
      name: 'lastSeenGeomHash',
      type: 'text',
      required: true,
      admin: { readOnly: true, description: 'Geometrian tiiviste viimeisellä osumalla.' },
    },
    {
      name: 'lastSeenAttrHash',
      type: 'text',
      required: true,
      admin: { readOnly: true, description: 'Attribuuttien tiiviste viimeisellä osumalla.' },
    },
    {
      name: 'distanceM',
      type: 'number',
      required: true,
      min: 0,
      label: 'Etäisyys keskipisteestä (m)',
      admin: { readOnly: true, description: '0, kun keskipiste on kuvion sisällä.' },
    },
  ],
}
