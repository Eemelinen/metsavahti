import type { CollectionConfig } from 'payload'

import { RESET_PASSWORD_SUBJECT, renderResetPassword } from '@/emails/ResetPassword'
import { VERIFY_EMAIL_SUBJECT, renderVerifyEmail } from '@/emails/VerifyEmail'
import { env } from '@/lib/env'
import { isAdmin, isAdminField, isAdminOrSelf, isAdminUser } from '@/payload/access'

export const DEFAULT_TIMEZONE = 'Europe/Helsinki'
export const DEFAULT_DAILY_HOUR = 9

/** IANA zone check through `Intl`; Node ships the full tz database. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    new Intl.DateTimeFormat('fi-FI', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/**
 * Auth collection (`01 §3.1`, ticket MV-031). Anyone can sign up; email verification is
 * required before login; users read and update only themselves, admins everything.
 * `role`, `plan` and `deletedAt` are admin-only fields; `marketingConsentAt` is derived.
 * `locale` is stored for MV-041+ (the UI is Finnish-only today); `notificationPrefs.mode`
 * follows `01 §4.3` (every run, daily digest, weekly digest); plan limits arrive with
 * `src/config/plans.ts` in MV-032 (ledger S15).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Käyttäjä', plural: 'Käyttäjät' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'role', 'plan', 'createdAt'],
    group: 'Käyttäjät',
  },
  auth: {
    // Email verification is required before login. Payload sends the link on `create`
    // (and on resend, MV-043) with the React Email template; only the HTML part is sent
    // because Payload's verify hook has no text-part slot.
    verify: {
      generateEmailHTML: async ({ token }) =>
        (await renderVerifyEmail({ token, baseUrl: env.NEXT_PUBLIC_SERVER_URL })).html,
      generateEmailSubject: () => VERIFY_EMAIL_SUBJECT,
    },
    // Reset links (`/uusi-salasana?token=`, MV-045) are valid for one hour. Payload sends the
    // React Email template on `forgotPassword` (HTML part only, like `verify`), whether the
    // request came from `/unohtunut-salasana`, the REST endpoint or the admin UI.
    forgotPassword: {
      expiration: 60 * 60 * 1000,
      generateEmailHTML: async (args) =>
        (
          await renderResetPassword({
            token: args?.token ?? '',
            baseUrl: env.NEXT_PUBLIC_SERVER_URL,
          })
        ).html,
      generateEmailSubject: () => RESET_PASSWORD_SUBJECT,
    },
    tokenExpiration: 60 * 60 * 24 * 7, // 7 days
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    // Server-side sessions: logging out or resetting a password invalidates other devices.
    useSessions: true,
  },
  access: {
    // Anyone can sign up; `role` is protected by field-level access below.
    create: () => true,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
    delete: isAdmin,
    admin: ({ req }) => isAdminUser(req.user),
  },
  hooks: {
    beforeChange: [
      // The very first account becomes admin so the instance can be managed.
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true })
        if (totalDocs === 0) return { ...data, role: 'admin' }
        // Never allow self-assigned admin role through the public API.
        return isAdminUser(req.user) ? data : { ...data, role: 'user' }
      },
      // `verificationSentAt` dates the pending verification link (MV-043: links are valid for
      // `VERIFICATION_LINK_TTL_MS`). Payload issues the token inside `create`; the resend
      // helper refreshes both together.
      ({ data, operation }) => {
        if (operation === 'create' && !data._verified) {
          return { ...data, verificationSentAt: new Date().toISOString() }
        }
        return data
      },
      // `marketingConsentAt` records when consent was last given; nobody sets it directly.
      ({ data, operation, originalDoc }) => {
        const { marketingConsentAt: _ignored, ...rest } = data
        const consent = rest.marketingConsent
        if (consent === undefined) return rest
        const previous = operation === 'create' ? false : Boolean(originalDoc?.marketingConsent)
        if (Boolean(consent) === previous) return rest
        return { ...rest, marketingConsentAt: consent ? new Date().toISOString() : null }
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Nimi',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      label: 'Rooli',
      options: [
        { label: 'Käyttäjä', value: 'user' },
        { label: 'Ylläpitäjä', value: 'admin' },
      ],
      access: {
        update: isAdminField,
      },
      saveToJWT: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'locale',
      type: 'select',
      defaultValue: 'fi',
      label: 'Kieli',
      options: [
        { label: 'Suomi', value: 'fi' },
        { label: 'English', value: 'en' },
      ],
    },
    {
      name: 'timezone',
      type: 'text',
      defaultValue: DEFAULT_TIMEZONE,
      label: 'Aikavyöhyke',
      validate: (value: unknown) =>
        isValidTimeZone(value) || 'Tuntematon aikavyöhyke (IANA-nimi, esim. Europe/Helsinki)',
    },
    {
      name: 'marketingConsent',
      type: 'checkbox',
      defaultValue: false,
      label: 'Markkinointilupa',
    },
    {
      name: 'marketingConsentAt',
      type: 'date',
      label: 'Markkinointilupa annettu',
      admin: { readOnly: true, description: 'Asetetaan automaattisesti, kun lupa annetaan.' },
    },
    {
      name: 'notificationPrefs',
      type: 'group',
      label: 'Ilmoitusasetukset',
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: true,
          label: 'Ilmoitukset käytössä',
        },
        {
          name: 'mode',
          type: 'select',
          defaultValue: 'immediate',
          label: 'Lähetystapa',
          options: [
            { label: 'Heti (jokaisella ajolla)', value: 'immediate' },
            { label: 'Päivittäinen kooste', value: 'daily' },
            { label: 'Viikoittainen kooste', value: 'weekly' },
          ],
        },
        {
          name: 'dailyHour',
          type: 'number',
          defaultValue: DEFAULT_DAILY_HOUR,
          min: 0,
          max: 23,
          label: 'Koosteen tunti',
          admin: { description: 'Tunti (0–23) käyttäjän aikavyöhykkeellä.' },
        },
      ],
    },
    {
      name: 'plan',
      type: 'select',
      defaultValue: 'free',
      label: 'Tilaus',
      options: [{ label: 'Ilmainen', value: 'free' }],
      access: {
        update: isAdminField,
      },
      admin: { position: 'sidebar' },
    },
    {
      name: 'verificationSentAt',
      type: 'date',
      label: 'Vahvistuslinkki lähetetty',
      access: {
        create: isAdminField,
        update: isAdminField,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Viimeisin vahvistuslinkki; linkki on voimassa 24 tuntia lähetyksestä.',
      },
    },
    {
      name: 'deletedAt',
      type: 'date',
      label: 'Poisto aloitettu',
      access: {
        update: isAdminField,
      },
      admin: {
        position: 'sidebar',
        description: 'Poistotyön merkki; rivi poistetaan pysyvästi työn lopussa.',
      },
    },
  ],
}
