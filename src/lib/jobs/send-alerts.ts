import { MAX_ALERT_SEND_ATTEMPTS } from '@/config/notifications'
import type { JobContext } from '@/lib/jobs/context'
import {
  type BuiltEmail,
  buildAlertDigestEmail,
  buildAlertImmediateEmail,
} from '@/lib/notifications/alert-emails'
import { type ScheduledDigest, isDigestDue } from '@/lib/notifications/digest-schedule'
import { emailProvider } from '@/lib/notifications/provider'
import type { Alert, Declaration, User, WatchArea } from '@/payload-types'

export type SendAlertsOptions = {
  /** The digest this run sends (`scheduledDigestFor()` at queue time); none by default. */
  scheduledDigest?: ScheduledDigest
}

export type SendAlertsResult = {
  emailsSent: number
  emailsFailed: number
  /** Alerts in an email this run, sent or failed. */
  alertsHandled: number
  /** Pending alerts left for a later run: notifications off, or their digest is not due. */
  alertsDeferred: number
  /** Pending alerts no longer retried after `MAX_ALERT_SEND_ATTEMPTS` failed sends. */
  alertsGivenUp: number
}

type PopulatedAlert = Omit<Alert, 'user' | 'watchArea' | 'declaration'> & {
  user: User
  watchArea: WatchArea
  declaration: Declaration
}

type AreaGroup = { watchArea: WatchArea; alerts: PopulatedAlert[] }

const DIGEST_PERIOD_DAYS = { daily: 1, weekly: 7 } as const
const DAY_MS = 24 * 60 * 60 * 1000

function isPopulated(alert: Alert): alert is PopulatedAlert {
  return (
    typeof alert.user === 'object' &&
    typeof alert.watchArea === 'object' &&
    typeof alert.declaration === 'object'
  )
}

/**
 * The `send-notifications` step (`01 §4.3`, MV-074; slug `send-alerts`, ledger D8). Groups the
 * not-yet-notified alerts per account and honours the account's `notificationPrefs` and each
 * area's `notificationsEnabled`: `immediate` sends one email per watch area on every run,
 * `daily` / `weekly` one digest of all pending alerts when the run's `scheduledDigest` is due.
 * Every email writes a `notification-log` row; a sent one stamps `notifiedAt` on its alerts. A
 * failed send leaves them pending for the next run until `MAX_ALERT_SEND_ATTEMPTS` failed rows
 * name an alert; then it is skipped. Alerts skipped for any reason stay pending (D-040).
 */
export async function sendAlerts(
  ctx: JobContext,
  jobRunId: string,
  { scheduledDigest = null }: SendAlertsOptions = {},
): Promise<SendAlertsResult> {
  const { payload, logger, now } = ctx
  const { docs } = await payload.find({
    collection: 'alerts',
    where: { notifiedAt: { exists: false } },
    depth: 1,
    sort: 'createdAt',
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  const pending = docs.filter(isPopulated)
  const failures = await failedAttempts(
    ctx,
    pending.map((a) => a.id),
  )

  const result: SendAlertsResult = {
    emailsSent: 0,
    emailsFailed: 0,
    alertsHandled: 0,
    alertsDeferred: 0,
    alertsGivenUp: 0,
  }

  const byUser = new Map<number, { user: User; areas: Map<number, AreaGroup> }>()
  for (const alert of pending) {
    const { user, watchArea } = alert
    if ((failures.get(alert.id) ?? 0) >= MAX_ALERT_SEND_ATTEMPTS) {
      result.alertsGivenUp += 1
      continue
    }
    if (user.deletedAt || user.notificationPrefs?.enabled === false) {
      result.alertsDeferred += 1
      continue
    }
    if (!watchArea.notificationsEnabled) {
      result.alertsDeferred += 1
      continue
    }
    const entry = byUser.get(user.id) ?? { user, areas: new Map<number, AreaGroup>() }
    const area = entry.areas.get(watchArea.id) ?? { watchArea, alerts: [] }
    area.alerts.push(alert)
    entry.areas.set(watchArea.id, area)
    byUser.set(user.id, entry)
  }

  for (const { user, areas } of byUser.values()) {
    const groups = [...areas.values()]
    const mode = user.notificationPrefs?.mode ?? 'immediate'
    const timeZone = user.timezone ?? undefined

    if (mode === 'immediate') {
      for (const { watchArea, alerts } of groups) {
        const email = await buildAlertImmediateEmail({
          userId: user.id,
          watchArea,
          alerts,
          timeZone,
          now: now(),
        })
        await deliver(
          ctx,
          jobRunId,
          { user, type: 'alert_immediate', alerts, email },
          failures,
          result,
        )
      }
      continue
    }

    const alerts = groups.flatMap((g) => g.alerts)
    if (!isDigestDue(mode, scheduledDigest)) {
      result.alertsDeferred += alerts.length
      continue
    }
    const periodEnd = now()
    const oldest = Math.min(...alerts.map((a) => new Date(a.createdAt).getTime()))
    const periodStart = new Date(
      Math.min(periodEnd.getTime() - DIGEST_PERIOD_DAYS[mode] * DAY_MS, oldest),
    )
    const email = await buildAlertDigestEmail({
      userId: user.id,
      mode,
      periodStart,
      periodEnd,
      areas: groups,
      timeZone,
      now: periodEnd,
    })
    await deliver(ctx, jobRunId, { user, type: 'alert_digest', alerts, email }, failures, result)
  }

  logger.info({ ...result, scheduledDigest }, 'send-alerts done')
  return result
}

/** Failed `notification-log` rows per alert id, i.e. the failed sends an alert was part of. */
async function failedAttempts(ctx: JobContext, alertIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  if (alertIds.length === 0) return counts
  const { docs } = await ctx.payload.find({
    collection: 'notification-log',
    where: { and: [{ status: { equals: 'failed' } }, { alerts: { in: alertIds } }] },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const row of docs) {
    for (const ref of row.alerts ?? []) {
      const id = typeof ref === 'object' ? ref.id : ref
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Send one alert email, stamp `notifiedAt` on its alerts when it went out and log it either
 * way. A failure is caught so the other accounts' emails of the run still go out.
 */
async function deliver(
  ctx: JobContext,
  jobRunId: string,
  {
    user,
    type,
    alerts,
    email,
  }: {
    user: User
    type: 'alert_immediate' | 'alert_digest'
    alerts: PopulatedAlert[]
    email: BuiltEmail
  },
  failures: Map<number, number>,
  result: SendAlertsResult,
): Promise<void> {
  const { payload, logger, now } = ctx
  const alertIds = alerts.map((a) => a.id)
  let status: 'sent' | 'failed' = 'sent'
  let error: string | undefined
  let providerMessageId: string | undefined
  try {
    const sent = await payload.sendEmail({ to: user.email, ...email })
    providerMessageId = messageIdOf(sent)
    result.emailsSent += 1
  } catch (err) {
    status = 'failed'
    error = err instanceof Error ? err.message : String(err)
    result.emailsFailed += 1
    logger.error({ err, userId: user.id, type, alertIds }, 'alert email failed')
    const exhausted = alertIds.filter(
      (id) => (failures.get(id) ?? 0) + 1 >= MAX_ALERT_SEND_ATTEMPTS,
    )
    if (exhausted.length > 0) {
      logger.warn(
        { userId: user.id, alertIds: exhausted, attempts: MAX_ALERT_SEND_ATTEMPTS },
        'alerts given up after repeated send failures',
      )
    }
  }
  result.alertsHandled += alerts.length

  const sentAt = now().toISOString()
  if (status === 'sent') {
    await payload.update({
      collection: 'alerts',
      where: { id: { in: alertIds } },
      data: { notifiedAt: sentAt },
      overrideAccess: true,
    })
  }
  await payload.create({
    collection: 'notification-log',
    data: {
      type,
      alerts: alertIds,
      user: user.id,
      recipient: user.email,
      provider: emailProvider(),
      providerMessageId,
      status,
      error,
      sentAt: status === 'sent' ? sentAt : undefined,
      jobRunId,
    },
    overrideAccess: true,
  })
}

/** Nodemailer answers `{ messageId }`, Resend `{ id }`; anything else has no id. */
function messageIdOf(sent: unknown): string | undefined {
  if (!sent || typeof sent !== 'object') return undefined
  const { messageId, id } = sent as { messageId?: unknown; id?: unknown }
  if (typeof messageId === 'string') return messageId
  if (typeof id === 'string') return id
  return undefined
}
