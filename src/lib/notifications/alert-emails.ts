import { type AlertDigestMode, alertDigestHeading, renderAlertDigest } from '@/emails/AlertDigest'
import { alertImmediateHeading, renderAlertImmediate } from '@/emails/AlertImmediate'
import type { AlertEmailItem } from '@/emails/AlertParts'
import { signMapImageToken } from '@/lib/alerts/map-image'
import { metsakeskusAttribution } from '@/lib/attribution'
import { fi } from '@/i18n/fi'
import { env } from '@/lib/env'
import { unsubscribeUrl } from '@/lib/notifications/unsubscribe'
import { alertSnapshot } from '@/payload/collections/Alerts'
import type { Alert, Declaration } from '@/payload-types'

/** What an alert email needs of an alert: the row itself and its populated declaration. */
export type AlertEmailSource = Pick<Alert, 'id' | 'changeType' | 'snapshot'> & {
  declaration: Pick<Declaration, 'declarationNumber' | 'cuttingTypeCode'>
}

type AreaAlerts = { watchArea: { id: number; name: string }; alerts: AlertEmailSource[] }

export type BuiltEmail = { subject: string; html: string; text: string }

/**
 * The template rows of `alerts`: snapshot facts (frozen at alert time), the current cutting
 * code for label, explanation and colour, the `/ilmoitukset/[id]` link and, with
 * `ENABLE_MAP_IMAGES=1`, the signed map image URL (MV-077; without the flag the route 404s).
 */
async function alertEmailItems(
  userId: number,
  alerts: AlertEmailSource[],
  now: Date,
): Promise<AlertEmailItem[]> {
  const base = env.NEXT_PUBLIC_SERVER_URL
  return Promise.all(
    alerts.map(async (alert) => {
      const snapshot = alertSnapshot(alert)
      const mapImageUrl =
        env.ENABLE_MAP_IMAGES === '1'
          ? `${base}/api/alerts/${alert.id}/map-image.png?token=${await signMapImageToken(userId, alert.id, now)}`
          : undefined
      return {
        href: `${base}/ilmoitukset/${alert.id}`,
        changeType: alert.changeType,
        declarationNumber: alert.declaration.declarationNumber,
        cuttingTypeCode: alert.declaration.cuttingTypeCode ?? null,
        areaHa: snapshot.areaHa,
        distanceM: snapshot.distanceM,
        receivedAt: snapshot.receivedAt,
        mapImageUrl,
      }
    }),
  )
}

/**
 * `AlertImmediate` for one watch area of `userId`: rows, a fresh unsubscribe link for the area
 * and the attribution of `now`'s month, rendered to subject + HTML + text.
 */
export async function buildAlertImmediateEmail({
  userId,
  watchArea,
  alerts,
  timeZone,
  now = new Date(),
}: AreaAlerts & { userId: number; timeZone?: string; now?: Date }): Promise<BuiltEmail> {
  const props = {
    watchAreaName: watchArea.name,
    alerts: await alertEmailItems(userId, alerts, now),
    unsubscribeUrl: await unsubscribeUrl(userId, watchArea.id, now),
    baseUrl: env.NEXT_PUBLIC_SERVER_URL,
    attribution: metsakeskusAttribution(now),
    timeZone,
  }
  return {
    subject: fi.emails.alert.subject(alertImmediateHeading(props)),
    ...(await renderAlertImmediate(props)),
  }
}

/** `AlertDigest` of `userId`'s pending alerts per area, each area with its own unsubscribe link. */
export async function buildAlertDigestEmail({
  userId,
  mode,
  periodStart,
  periodEnd,
  areas,
  timeZone,
  now = new Date(),
}: {
  userId: number
  mode: AlertDigestMode
  periodStart: Date
  periodEnd: Date
  areas: AreaAlerts[]
  timeZone?: string
  now?: Date
}): Promise<BuiltEmail> {
  const groups = await Promise.all(
    areas.map(async ({ watchArea, alerts }) => ({
      watchAreaName: watchArea.name,
      unsubscribeUrl: await unsubscribeUrl(userId, watchArea.id, now),
      alerts: await alertEmailItems(userId, alerts, now),
    })),
  )
  const rendered = await renderAlertDigest({
    mode,
    periodStart,
    periodEnd,
    groups,
    baseUrl: env.NEXT_PUBLIC_SERVER_URL,
    attribution: metsakeskusAttribution(now),
    timeZone,
  })
  return { subject: fi.emails.alert.subject(alertDigestHeading({ groups })), ...rendered }
}
