import path from 'node:path'
import type { CollectionConfig } from 'payload'

import { env } from '@/lib/env'
import { isAdmin, isAdminOrOwner } from '@/payload/access'

/**
 * Private upload collection for account-export archives (`01 §4.5`, MV-035). Files live
 * on local disk (`EXPORTS_DIR`) in development and test, and in S3-compatible storage
 * when `S3_BUCKET` is set (`payload.config.ts`, D-013). Only the owner and admins can
 * list a document or download its file; the `export` job creates documents with
 * `overrideAccess` and the cleanup deletes them after `data_export_requests.expiresAt`.
 */
export const Exports: CollectionConfig = {
  slug: 'exports',
  labels: { singular: 'Vientitiedosto', plural: 'Vientitiedostot' },
  admin: {
    defaultColumns: ['filename', 'user', 'filesize', 'createdAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdminOrOwner('user'),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  upload: {
    staticDir: path.resolve(env.EXPORTS_DIR),
    mimeTypes: ['application/zip'],
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
  ],
}
