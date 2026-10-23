import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'
import { hakkuutapaLabel } from '@/lib/wfs/hakkuutapa'

/** A declaration stays valid for three years from the day Metsäkeskus received it (`01 §3.3`). */
export const DECLARATION_VALIDITY_YEARS = 3

export function validUntilFor(receivedAt: string | Date): string {
  const d = new Date(receivedAt)
  d.setUTCFullYear(d.getUTCFullYear() + DECLARATION_VALIDITY_YEARS)
  return d.toISOString()
}

const deny = () => false

/**
 * Cache of Metsäkeskus forest-use declaration stands (`01 §3.3`, ticket MV-033).
 * Written only by the `fetch-declarations` job through the Local API; nobody can
 * create, update or delete rows through the REST/GraphQL API and only admins can
 * read them (the admin UI shows them read-only). The PostGIS columns `geom`
 * (MultiPolygon, EPSG:3067) and `centroid` (Point, generated from `geom`) are
 * managed in migrations and `lib/geo/spatial-queries.ts`, not as Payload fields.
 * `cuttingTypeLabel` and `validUntil` are derived here so every writer agrees.
 */
export const Declarations: CollectionConfig = {
  slug: 'declarations',
  labels: { singular: 'Metsänkäyttöilmoitus', plural: 'Metsänkäyttöilmoitukset' },
  admin: {
    useAsTitle: 'declarationNumber',
    defaultColumns: ['declarationNumber', 'sourceId', 'cuttingTypeLabel', 'areaHa', 'lastSeenAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        const next = { ...data }
        if ('cuttingTypeCode' in next) {
          next.cuttingTypeLabel = hakkuutapaLabel(next.cuttingTypeCode)
        }
        if (next.receivedAt) {
          next.validUntil = validUntilFor(next.receivedAt)
        }
        return next
      },
    ],
  },
  fields: [
    {
      name: 'sourceId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'WFS feature id',
      admin: { readOnly: true },
    },
    {
      name: 'sourceLayerVersion',
      type: 'text',
      label: 'WFS-tason versio',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'declarationNumber',
      type: 'text',
      required: true,
      index: true,
      label: 'Ilmoitusnumero',
    },
    { name: 'cuttingTypeCode', type: 'number', label: 'Hakkuutapa (koodi)' },
    {
      name: 'cuttingTypeLabel',
      type: 'text',
      label: 'Hakkuutapa',
      admin: { readOnly: true, description: 'Johdettu koodista (lib/wfs/hakkuutapa.ts).' },
    },
    { name: 'areaHa', type: 'number', label: 'Pinta-ala (ha)' },
    { name: 'receivedAt', type: 'date', label: 'Saapumispäivä' },
    {
      name: 'validUntil',
      type: 'date',
      index: true,
      label: 'Voimassa asti',
      admin: { readOnly: true, description: 'Saapumispäivä + 3 vuotta.' },
    },
    { name: 'municipalityCode', type: 'text', label: 'Kuntakoodi' },
    {
      name: 'rawAttributes',
      type: 'json',
      label: 'Kaikki WFS-attribuutit',
      admin: { readOnly: true },
    },
    { name: 'geomHash', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'attrHash', type: 'text', required: true, index: true, admin: { readOnly: true } },
    {
      name: 'firstSeenAt',
      type: 'date',
      required: true,
      label: 'Nähty ensimmäisen kerran',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'lastSeenAt',
      type: 'date',
      required: true,
      index: true,
      label: 'Nähty viimeksi',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'removedAt',
      type: 'date',
      index: true,
      label: 'Poistunut aineistosta',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Asetetaan, kun kohde puuttuu tuloksista kolmella peräkkäisellä ajolla.',
      },
    },
  ],
}
