import { notificationSchedule } from '@/config/notifications'

/**
 * Which digests a pipeline run sends (`01 §4.3`): `daily` on the morning run, `weekly` on
 * Monday's morning run (daily digests go out then too), `null` on every other run, which
 * sends immediate emails only.
 */
export type ScheduledDigest = 'daily' | 'weekly' | null

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: notificationSchedule.timeZone,
  weekday: 'short',
  hour: 'numeric',
  hourCycle: 'h23',
})

/** The digest a run starting at `now` sends, read in Finnish time whatever the host zone. */
export function scheduledDigestFor(now: Date): ScheduledDigest {
  const parts = localParts.formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const weekday = WEEKDAYS.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '') + 1
  const { fromHour, toHour } = notificationSchedule.digestWindow
  if (!(hour >= fromHour && hour < toHour)) return null
  return weekday === notificationSchedule.weeklyDigestWeekday ? 'weekly' : 'daily'
}

/** Whether an account in digest `mode` gets its digest on a run that sends `scheduled`. */
export function isDigestDue(mode: 'daily' | 'weekly', scheduled: ScheduledDigest): boolean {
  if (scheduled === null) return false
  return mode === 'daily' || scheduled === 'weekly'
}
