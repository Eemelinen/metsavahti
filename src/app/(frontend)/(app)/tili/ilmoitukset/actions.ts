'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import {
  marketingConsentSchema,
  notificationPrefsSchema,
  watchAreaNotificationsSchema,
} from '@/lib/account/account-schema'
import {
  sendTestAlertEmail,
  setMarketingConsent as saveMarketingConsent,
  setWatchAreaNotifications as saveWatchAreaNotifications,
  updateNotificationPrefs as savePrefs,
} from '@/lib/account/notification-settings'
import { requireUser } from '@/lib/auth/guards'
import { RateLimited, actionResult } from '@/lib/errors'
import { clientIp } from '@/lib/privacy/ip'

/**
 * Server Actions of `/tili/ilmoitukset` (E04 MV-054). Every switch saves on its own; the
 * account always comes from the session (`requireUser()`), never from the input. The inputs
 * come from switches, not typed fields, so a malformed one is a bug or tampering: the parse
 * throws and `actionResult()` answers with the generic error.
 */

/** The global "Sähköposti-ilmoitukset" switch and "Lähetystapa". */
export async function updateNotificationPrefs(input: unknown) {
  return actionResult(async () => {
    const data = notificationPrefsSchema.parse(input)
    const user = await requireUser()
    return savePrefs(await getPayload({ config }), user, data)
  })
}

/** One row of "Vahtialuekohtaiset asetukset"; the area must be the account's own. */
export async function setWatchAreaNotifications(input: unknown) {
  return actionResult(async () => {
    const data = watchAreaNotificationsSchema.parse(input)
    const user = await requireUser()
    await saveWatchAreaNotifications(await getPayload({ config }), user, data.id, data.enabled)
  })
}

/** "Palvelun uutiset": the marketing consent, recorded in `consent-events`. */
export async function setMarketingConsent(input: unknown) {
  return actionResult(async () => {
    const data = marketingConsentSchema.parse(input)
    const user = await requireUser()
    const requestHeaders = await headers()
    await saveMarketingConsent(await getPayload({ config }), user, data.granted, {
      ip: clientIp(requestHeaders),
      userAgent: requestHeaders.get('user-agent'),
    })
  })
}

/** "Lähetä testisähköposti" (3 / h / account). */
export async function sendTestEmail() {
  return actionResult(async () => {
    const user = await requireUser()
    const outcome = await sendTestAlertEmail(await getPayload({ config }), user)
    if (outcome.status === 'limited') throw new RateLimited(outcome.retryAfterSeconds)
    return { email: outcome.email }
  })
}
