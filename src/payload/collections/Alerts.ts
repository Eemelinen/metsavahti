import type { CollectionConfig, Field } from 'payload'
import { z } from 'zod'

import { isAdmin, isAdminField, isAdminOrOwner } from '@/payload/access'
import type { Alert } from '@/payload-types'

export const ALERT_CHANGE_TYPES = [
  'new',
  'geometry_changed',
  'attributes_changed',
  'removed',
] as const
export type AlertChangeType = (typeof ALERT_CHANGE_TYPES)[number]

/**
 * What the alert feed shows, frozen at alert time (`01 §3.5`): the declaration may
 * change or disappear later, and users cannot read `declarations` anyway.
 */
export type AlertSnapshot = {
  cuttingTypeLabel: string | null
  areaHa: number | null
  distanceM: number
  receivedAt: string | null
}

const snapshotSchema = z.object({
  cuttingTypeLabel: z.string().nullable().catch(null),
  areaHa: z.number().nullable().catch(null),
  distanceM: z.number().catch(0),
  receivedAt: z.string().nullable().catch(null),
})

/** Reads `alert.snapshot` defensively: a hand-edited or missing snapshot degrades to nulls. */
export function alertSnapshot(alert: Pick<Alert, 'snapshot'>): AlertSnapshot {
  const parsed = snapshotSchema.safeParse(alert.snapshot)
  return parsed.success
    ? parsed.data
    : { cuttingTypeLabel: null, areaHa: null, distanceM: 0, receivedAt: null }
}

/** Only admins (and the pipeline, with `overrideAccess`) may change anything but `readAt`. */
const adminOnlyUpdate = (field: Field): Field =>
  ({
    ...field,
    access: { ...('access' in field ? field.access : {}), update: isAdminField },
  }) as Field

/**
 * One alert = one (watch area, declaration) change the owner should hear about
 * (`01 §3.5`, ticket MV-034). Created by `match-watch-areas`; `send-alerts` stamps
 * `notifiedAt`. Owners read their own alerts and may only mark them read (`readAt`);
 * every other field is admin-only on update and nobody creates or deletes through the
 * API except admins. Delivery state lives in `notification-log`.
 */
export const Alerts: CollectionConfig = {
  slug: 'alerts',
  labels: { singular: 'Hälytys', plural: 'Hälytykset' },
  admin: {
    defaultColumns: ['user', 'watchArea', 'declaration', 'changeType', 'notifiedAt', 'createdAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdminOrOwner('user'),
    create: isAdmin,
    update: isAdminOrOwner('user'),
    delete: isAdmin,
  },
  // `01 §3.5` / MV-034: the feed reads (user, createdAt desc); send-alerts and the digest
  // read (user, notifiedAt). The migration adds DESC to the first by hand.
  indexes: [{ fields: ['user', 'createdAt'] }, { fields: ['user', 'notifiedAt'] }],
  fields: [
    ...(
      [
        {
          name: 'user',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          label: 'Käyttäjä',
        },
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
          name: 'changeType',
          type: 'select',
          required: true,
          label: 'Muutos',
          options: [
            { label: 'Uusi', value: 'new' },
            { label: 'Rajaus muuttunut', value: 'geometry_changed' },
            { label: 'Tiedot muuttuneet', value: 'attributes_changed' },
            { label: 'Poistunut aineistosta', value: 'removed' },
          ],
        },
        {
          name: 'notifiedAt',
          type: 'date',
          label: 'Lähetetty',
          admin: { position: 'sidebar', description: 'Sähköposti lähetetty.' },
        },
        {
          name: 'snapshot',
          type: 'json',
          required: true,
          label: 'Tilannekuva',
          admin: {
            description:
              'cuttingTypeLabel, areaHa, distanceM, receivedAt hälytyshetkellä (syöte ei muutu, vaikka ilmoitus muuttuisi).',
          },
        },
      ] satisfies Field[]
    ).map(adminOnlyUpdate),
    {
      name: 'readAt',
      type: 'date',
      label: 'Luettu',
      admin: { position: 'sidebar' },
    },
  ],
}
