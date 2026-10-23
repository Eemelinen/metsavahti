import type { Access, CollectionConfig } from 'payload'

import { LEGAL_DOCUMENT_SLUGS, LEGAL_DOCUMENT_TITLES } from '@/lib/legal/documents'
import { isAdmin, isAdminUser } from '@/payload/access'

/** Anyone (including anonymous visitors) reads published versions; admins read everything. */
const readPublished: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true
  return { publishedAt: { less_than_equal: new Date().toISOString() } }
}

/**
 * Legal documents (`01 §3.10`, `01 §5`, MV-036). One row per (slug, version): a new version
 * is a new row, never an edit of the old one, because `consent_events.version` refers to
 * the string a user accepted. The legal pages and the registration flow resolve the latest
 * published version through `findLatestLegalDocument()` (`lib/legal/documents.ts`).
 * `requiresReacceptance` turns the soft re-acceptance banner into a blocking prompt (MV-086).
 */
export const LegalDocuments: CollectionConfig = {
  slug: 'legal-documents',
  labels: { singular: 'Oikeudellinen asiakirja', plural: 'Oikeudelliset asiakirjat' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'version', 'publishedAt', 'requiresReacceptance'],
    group: 'Metsävahti',
  },
  access: {
    read: readPublished,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  indexes: [{ fields: ['slug', 'version'], unique: true }],
  fields: [
    { name: 'title', type: 'text', required: true, label: 'Otsikko' },
    {
      name: 'slug',
      type: 'select',
      required: true,
      index: true,
      label: 'Asiakirja',
      options: LEGAL_DOCUMENT_SLUGS.map((value) => ({
        label: LEGAL_DOCUMENT_TITLES[value],
        value,
      })),
    },
    {
      name: 'version',
      type: 'text',
      required: true,
      label: 'Versio',
      admin: { description: 'Esim. 2026-09. Uusi versio on aina uusi asiakirja.' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      label: 'Julkaistu',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Tyhjä = luonnos. Sivut näyttävät uusimman julkaistun version.',
      },
    },
    {
      name: 'requiresReacceptance',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      label: 'Vaatii uuden hyväksynnän',
    },
    { name: 'changeSummary', type: 'textarea', label: 'Muutosten yhteenveto' },
    { name: 'body', type: 'richText', required: true, label: 'Sisältö' },
  ],
}
