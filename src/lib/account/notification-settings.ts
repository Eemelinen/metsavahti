import {
  type Payload,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
} from 'payload'

import { renderAlertImmediate } from '@/emails/AlertImmediate'
import type { AlertEmailItem } from '@/emails/AlertParts'
import { EMAIL_SETTINGS_PATH } from '@/emails/EmailLayout'
import { fi } from '@/i18n/fi'
import type { NotificationMode, NotificationPrefsInput } from '@/lib/account/account-schema'
import { metsakeskusAttribution } from '@/lib/attribution'
import { env } from '@/lib/env'
import { findLatestLegalDocument } from '@/lib/legal/documents'
import { createRateLimiter } from '@/lib/rate-limit'
import { DEFAULT_DAILY_HOUR } from '@/payload/collections/Users'
import type { User } from '@/payload-types'

/** "Lähetä testisähköposti": three per hour per account (ticket MV-054). */
export const testEmailLimiter = createRateLimiter({
  name: 'test-email',
  limit: 3,
  windowMs: 60 * 60 * 1000,
})

/** What `/tili/ilmoitukset` shows: the account's switches as stored. */
export type NotificationSettings = {
  enabled: boolean
  mode: NotificationMode
  dailyHour: number
  marketing: boolean
}

export function notificationSettingsOf(user: User): NotificationSettings {
  const prefs = user.notificationPrefs
  return {
    enabled: prefs?.enabled ?? true,
    mode: prefs?.mode ?? 'immediate',
    dailyHour: prefs?.dailyHour ?? DEFAULT_DAILY_HOUR,
    marketing: Boolean(user.marketingConsent),
  }
}

/** One row of the per-area table: the area's own `notificationsEnabled` switch. */
export type WatchAreaNotificationRow = {
  id: number
  name: string
  addressLabel: string | null
  notificationsEnabled: boolean
}

/**
 * The account's own watch areas for the override table, by name. Filtered by owner as well as
 * read as the user, so an admin sees their own areas here and not everyone's.
 */
export async function listWatchAreaNotifications(
  payload: Payload,
  user: User,
): Promise<WatchAreaNotificationRow[]> {
  const { docs } = await payload.find({
    collection: 'watch-areas',
    where: { owner: { equals: user.id } },
    sort: 'name',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: false,
    user,
  })
  return docs.map((area) => ({
    id: area.id,
    name: area.name,
    addressLabel: area.addressLabel ?? null,
    notificationsEnabled: area.notificationsEnabled ?? true,
  }))
}

/**
 * The global switch and the delivery mode (`users.notificationPrefs`, `01 §4.3`). The group is
 * written whole from the stored values plus `changes`, so saving one control never resets the
 * other or `dailyHour`. Written as the user (`isAdminOrSelf`); the id comes from the session.
 */
export async function updateNotificationPrefs(
  payload: Payload,
  user: User,
  changes: NotificationPrefsInput,
): Promise<NotificationSettings> {
  const current = notificationSettingsOf(user)
  const saved = await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      notificationPrefs: {
        enabled: changes.enabled ?? current.enabled,
        mode: changes.mode ?? current.mode,
        dailyHour: current.dailyHour,
      },
    },
    depth: 0,
    overrideAccess: false,
    user,
  })
  return notificationSettingsOf(saved)
}

export type ConsentContext = {
  /** Client address; the collection hook reduces it to its network prefix. */
  ip: string | null
  userAgent: string | null
}

/**
 * The "Palvelun uutiset" switch (`01 §8`: withdrawal as easy as giving): sets
 * `users.marketingConsent` (the collection hook dates `marketingConsentAt`) and appends a
 * `marketing` consent event with `granted` at the current privacy-policy version, as
 * registration does. Both writes share one transaction, so the flag never changes without its
 * event. The field is admin-only (`Users`), so this server path writes it with `overrideAccess`
 * for the session's own id. Nothing is written when the value does not change, so the trail
 * holds decisions, not clicks.
 */
export async function setMarketingConsent(
  payload: Payload,
  user: User,
  granted: boolean,
  context: ConsentContext,
): Promise<{ changed: boolean }> {
  if (Boolean(user.marketingConsent) === granted) return { changed: false }
  const privacy = await findLatestLegalDocument(payload, 'privacy')
  if (!privacy) {
    throw new Error('The privacy policy is not published; run pnpm db:seed first')
  }
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { marketingConsent: granted },
      depth: 0,
      overrideAccess: true,
      req,
    })
    await payload.create({
      collection: 'consent-events',
      data: {
        user: user.id,
        kind: 'marketing',
        version: privacy.version,
        granted,
        ip: context.ip,
        userAgent: context.userAgent,
      },
      overrideAccess: true,
      req,
    })
    await commitTransaction(req)
  } catch (error) {
    await killTransaction(req)
    throw error
  }
  return { changed: true }
}

/**
 * The sample rows of the test email: one new declaration and one whose boundary changed. Their
 * links open the alert list (there is no alert behind them).
 */
function testAlertItems(baseUrl: string): AlertEmailItem[] {
  return [
    {
      href: `${baseUrl}/ilmoitukset`,
      changeType: 'new',
      declarationNumber: '2026-TESTI-0001',
      cuttingTypeCode: 5,
      areaHa: 2.4,
      distanceM: 320,
      receivedAt: '2026-09-05T09:30:00.000Z',
    },
    {
      href: `${baseUrl}/ilmoitukset`,
      changeType: 'geometry_changed',
      declarationNumber: '2026-TESTI-0002',
      cuttingTypeCode: 3,
      areaHa: 5.1,
      distanceM: 780,
      receivedAt: '2026-09-04T09:30:00.000Z',
    },
  ]
}

export type TestEmailOutcome =
  { status: 'sent'; email: string } | { status: 'limited'; retryAfterSeconds: number }

/**
 * "Lähetä testisähköposti": the immediate alert email (`AlertImmediate`) with fixture rows, sent to
 * the account's own address so the user sees what an alert looks like and that mail arrives.
 * It does not touch alerts or the notification log, and it is sent whatever the switches say.
 */
export async function sendTestAlertEmail(
  payload: Payload,
  user: Pick<User, 'id' | 'email'>,
  now: Date = new Date(),
): Promise<TestEmailOutcome> {
  // The slot is spent before the send, so a failed delivery also counts: the limit guards the
  // mailbox, and a retry within the hour is still possible twice.
  const limit = await testEmailLimiter.check(String(user.id))
  if (!limit.allowed) return { status: 'limited', retryAfterSeconds: limit.retryAfterSeconds }
  const baseUrl = env.NEXT_PUBLIC_SERVER_URL
  // The sample area does not exist, so its "stop" link opens the settings page instead.
  const { html, text } = await renderAlertImmediate({
    watchAreaName: fi.emails.testAlert.watchAreaName,
    alerts: testAlertItems(baseUrl),
    unsubscribeUrl: `${baseUrl}${EMAIL_SETTINGS_PATH}`,
    baseUrl,
    attribution: metsakeskusAttribution(now),
  })
  await payload.sendEmail({ to: user.email, subject: fi.emails.testAlert.subject, html, text })
  return { status: 'sent', email: user.email }
}
