import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

/**
 * One row per email the app sends or fails to send (`01 §3.6`, MV-035). Written by the
 * jobs and the auth flows with `overrideAccess`; admins read it for support, the account
 * export includes the user's own rows (`01 §4.5`). Delivery state of alerts lives here,
 * not on the alert (`01 §3.5`).
 */
export const NotificationLog: CollectionConfig = {
  slug: 'notification-log',
  labels: { singular: 'Ilmoitusloki', plural: 'Ilmoitusloki' },
  admin: {
    defaultColumns: ['type', 'status', 'recipient', 'provider', 'sentAt'],
    group: 'Metsävahti',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', index: true, label: 'Käyttäjä' },
    {
      name: 'type',
      type: 'select',
      required: true,
      index: true,
      label: 'Tyyppi',
      options: [
        { label: 'Hälytys (heti)', value: 'alert_immediate' },
        { label: 'Hälytys (kooste)', value: 'alert_digest' },
        { label: 'Sähköpostin vahvistus', value: 'verify_email' },
        { label: 'Salasanan palautus', value: 'password_reset' },
        { label: 'Sähköpostin vaihto', value: 'email_change' },
        { label: 'Tietojen vienti', value: 'data_export' },
        { label: 'Tili poistettu', value: 'account_deleted' },
      ],
    },
    {
      name: 'alerts',
      type: 'relationship',
      relationTo: 'alerts',
      hasMany: true,
      label: 'Hälytykset',
    },
    { name: 'recipient', type: 'email', label: 'Vastaanottaja' },
    { name: 'provider', type: 'text', required: true, label: 'Lähetystapa' },
    { name: 'providerMessageId', type: 'text', label: 'Viestin tunniste' },
    {
      name: 'status',
      type: 'select',
      required: true,
      index: true,
      label: 'Tila',
      options: [
        { label: 'Jonossa', value: 'queued' },
        { label: 'Lähetetty', value: 'sent' },
        { label: 'Epäonnistui', value: 'failed' },
      ],
    },
    { name: 'error', type: 'textarea', label: 'Virhe' },
    { name: 'sentAt', type: 'date', label: 'Lähetetty', admin: { readOnly: true } },
    { name: 'jobRunId', type: 'text', index: true, label: 'Ajon tunniste' },
  ],
}
