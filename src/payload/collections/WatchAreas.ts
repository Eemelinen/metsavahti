import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'

import { planLimits } from '@/config/plans'
import { isAdminOrOwner, isAdminUser, isAuthenticated } from '@/payload/access'

export const MIN_RADIUS_M = 100
export const MAX_RADIUS_M = 5_000

const ownerId = (owner: unknown): number | undefined => {
  if (typeof owner === 'number') return owner
  if (owner && typeof owner === 'object' && 'id' in owner) return (owner as { id: number }).id
  return undefined
}

/**
 * A user-defined circular area to watch (`01 §3.2`, ticket MV-032). `center` is stored
 * as a WGS 84 point by Payload; the PostGIS generated column `geom_3067` (initial
 * migration, D-003, ledger D1) holds the buffered polygon in EPSG:3067 used for
 * matching. `lastCheckedAt` / `lastDeclarationCount` are written by the pipeline.
 * The owner's plan limit (`config/plans.ts`) is enforced on create and when an
 * admin re-assigns ownership.
 */
export const WatchAreas: CollectionConfig = {
  slug: 'watch-areas',
  labels: { singular: 'Vahtialue', plural: 'Vahtialueet' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'radiusM', 'owner', 'lastCheckedAt', 'updatedAt'],
    group: 'Metsävahti',
  },
  access: {
    create: isAuthenticated,
    read: isAdminOrOwner('owner'),
    update: isAdminOrOwner('owner'),
    delete: isAdminOrOwner('owner'),
  },
  hooks: {
    beforeValidate: [
      // Non-admins always own what they create; they cannot re-assign ownership.
      ({ data, req }) => {
        if (!data || !req.user || isAdminUser(req.user)) return data
        return { ...data, owner: req.user.id }
      },
      // Plan limit: an owner may hold at most `maxWatchAreas` areas (`01 §3.1`).
      async ({ data, operation, originalDoc, req }) => {
        if (!data) return data
        const owner = ownerId(data.owner)
        if (owner === undefined) return data
        if (operation === 'update' && owner === ownerId(originalDoc?.owner)) return data

        const user = await req.payload.findByID({
          collection: 'users',
          id: owner,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const { maxWatchAreas } = planLimits(user.plan)
        const { totalDocs } = await req.payload.count({
          collection: 'watch-areas',
          where: { owner: { equals: owner } },
          overrideAccess: true,
          req,
        })
        if (totalDocs >= maxWatchAreas) {
          throw new ValidationError({
            collection: 'watch-areas',
            errors: [
              {
                path: 'owner',
                message: `Tilaukseen kuuluu enintään ${maxWatchAreas} vahtialuetta.`,
              },
            ],
            req,
          })
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: 'Nimi' },
    {
      name: 'center',
      type: 'point',
      required: true,
      label: 'Keskipiste (WGS 84)',
    },
    {
      name: 'radiusM',
      type: 'number',
      required: true,
      defaultValue: 1000,
      min: MIN_RADIUS_M,
      max: MAX_RADIUS_M,
      label: 'Säde (m)',
      admin: { description: `${MIN_RADIUS_M}–${MAX_RADIUS_M} m.` },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Omistaja',
      defaultValue: ({ user }) => user?.id,
      admin: { position: 'sidebar' },
    },
    {
      name: 'notificationsEnabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Ilmoitukset käytössä',
    },
    {
      name: 'addressLabel',
      type: 'text',
      label: 'Osoite',
      admin: { description: 'Geokoodattu osoite tai paikannimi keskipisteelle.' },
    },
    {
      name: 'lastCheckedAt',
      type: 'date',
      label: 'Tarkistettu viimeksi',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'lastDeclarationCount',
      type: 'number',
      min: 0,
      label: 'Ilmoituksia viime tarkistuksessa',
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
}
