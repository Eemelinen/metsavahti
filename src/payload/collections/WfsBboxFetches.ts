import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * One row per live WFS fetch the watch-area preview made (MV-063, D-036): the EPSG:3067 box
 * (`minE`, `minN`, `maxE`, `maxN`, metres), how many declarations came back and when. A preview
 * whose box the stored boxes cover answers from the local `declarations` cache alone. The box is
 * four numbers rather than a PostGIS column so the table comes from a generated migration;
 * `src/lib/geo/spatial-queries.ts` builds the envelopes. Only that module writes it; admins read it.
 */
export const WfsBboxFetches: CollectionConfig = {
  slug: 'wfs-bbox-fetches',
  labels: { singular: 'WFS-haku', plural: 'WFS-haut' },
  admin: {
    defaultColumns: ['fetchedAt', 'featureCount', 'minE', 'minN'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  fields: [
    { name: 'minE', type: 'number', required: true, label: 'Min E (EPSG:3067)' },
    { name: 'minN', type: 'number', required: true, label: 'Min N (EPSG:3067)' },
    { name: 'maxE', type: 'number', required: true, label: 'Max E (EPSG:3067)' },
    { name: 'maxN', type: 'number', required: true, label: 'Max N (EPSG:3067)' },
    { name: 'featureCount', type: 'number', required: true, label: 'Ilmoituksia' },
    { name: 'fetchedAt', type: 'date', required: true, index: true, label: 'Haettu' },
  ],
}
