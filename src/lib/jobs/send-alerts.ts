import { type AlertEmailDeclaration, renderAlertEmail } from '@/emails/AlertEmail'
import { metsakeskusAttribution } from '@/lib/attribution'
import { env } from '@/lib/env'
import type { JobContext } from '@/lib/jobs/context'
import { emailProvider } from '@/lib/notifications/provider'
import { alertSnapshot } from '@/payload/collections/Alerts'
import type { Alert, Declaration, User, WatchArea } from '@/payload-types'

export type SendAlertsResult = { emailsSent: number; emailsFailed: number; alertsHandled: number }

type PopulatedAlert = Omit<Alert, 'user' | 'watchArea' | 'declaration'> & {
  user: User
  watchArea: WatchArea
  declaration: Declaration
}

function isPopulated(alert: Alert): alert is PopulatedAlert {
  return (
    typeof alert.user === 'object' &&
    typeof alert.watchArea === 'object' &&
    typeof alert.declaration === 'object'
  )
}

/**
 * Group not-yet-notified alerts per (user, watch area), send one email per group,
 * stamp `notifiedAt` on the alerts that went out and write a notification-log row.
 * A failed send leaves `notifiedAt` empty so the next run retries; the failure itself
 * is recorded in `notification-log` (`01 §3.5`: delivery state lives there).
 */
export async function sendAlerts(ctx: JobContext, jobRunId: string): Promise<SendAlertsResult> {
  const { payload, logger, now } = ctx
  const { docs } = await payload.find({
    collection: 'alerts',
    where: { notifiedAt: { exists: false } },
    depth: 1,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })

  const groups = new Map<string, PopulatedAlert[]>()
  for (const alert of docs) {
    if (!isPopulated(alert)) continue
    if (!alert.watchArea.notificationsEnabled) continue
    const key = `${alert.user.id}:${alert.watchArea.id}`
    groups.set(key, [...(groups.get(key) ?? []), alert])
  }

  let emailsSent = 0
  let emailsFailed = 0
  let alertsHandled = 0

  for (const alerts of groups.values()) {
    const first = alerts[0]
    if (!first) continue
    const { user, watchArea } = first
    const declarations: AlertEmailDeclaration[] = alerts.map((a) => {
      const snapshot = alertSnapshot(a)
      return {
        declarationNumber: a.declaration.declarationNumber,
        hakkuutapa: a.declaration.cuttingTypeCode ?? null,
        areaHa: snapshot.areaHa,
        distanceM: snapshot.distanceM,
        changeType: a.changeType,
      }
    })

    const { html, text } = await renderAlertEmail({
      watchAreaName: watchArea.name,
      declarations,
      baseUrl: env.NEXT_PUBLIC_SERVER_URL,
      attribution: metsakeskusAttribution(now()),
    })

    let status: 'sent' | 'failed' = 'sent'
    let error: string | undefined
    let providerMessageId: string | undefined
    try {
      const sent = await payload.sendEmail({
        to: user.email,
        subject: `Metsävahti: ${declarations.length} ilmoitusta alueella ${watchArea.name}`,
        html,
        text,
      })
      providerMessageId = messageIdOf(sent)
      emailsSent += 1
    } catch (err) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
      emailsFailed += 1
      logger.error({ err, userId: user.id, watchAreaId: watchArea.id }, 'alert email failed')
    }

    const notifiedAt = now().toISOString()
    for (const alert of alerts) {
      if (status === 'sent') {
        await payload.update({
          collection: 'alerts',
          id: alert.id,
          data: { notifiedAt },
          overrideAccess: true,
        })
      }
      alertsHandled += 1
    }
    await payload.create({
      collection: 'notification-log',
      data: {
        type: 'alert_immediate',
        alerts: alerts.map((a) => a.id),
        user: user.id,
        recipient: user.email,
        provider: emailProvider(),
        providerMessageId,
        status,
        error,
        sentAt: status === 'sent' ? notifiedAt : undefined,
        jobRunId,
      },
      overrideAccess: true,
    })
  }

  const result = { emailsSent, emailsFailed, alertsHandled }
  logger.info(result, 'send-alerts done')
  return result
}

/** Nodemailer answers `{ messageId }`, Resend `{ id }`; anything else has no id. */
function messageIdOf(sent: unknown): string | undefined {
  if (!sent || typeof sent !== 'object') return undefined
  const { messageId, id } = sent as { messageId?: unknown; id?: unknown }
  if (typeof messageId === 'string') return messageId
  if (typeof id === 'string') return id
  return undefined
}
