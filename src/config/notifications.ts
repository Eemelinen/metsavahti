/**
 * Alert delivery schedule (`01 §4.3`, `01 §11`, MV-074). The pipeline runs at 09:30 and 21:30
 * Finnish time (`01 §2`); the morning run is the digest run: daily digests go out on every
 * morning run, weekly digests on Monday's. Read by `scheduledDigestFor()` and `send-alerts`.
 */
export const notificationSchedule = {
  /** The zone the run times are read in, whatever the account's own `timezone`. */
  timeZone: 'Europe/Helsinki',
  /**
   * A run that starts in `[fromHour, toHour)` local time is the digest run. The window covers
   * the 09:30 cron with room for a late or retried trigger and never reaches the 21:30 run.
   */
  digestWindow: { fromHour: 9, toHour: 12 },
  /** ISO weekday of the weekly digest (1 = Monday). */
  weeklyDigestWeekday: 1,
} as const

/** Failed sends after which an alert is no longer retried (`01 §4.3`: "after 5 failures"). */
export const MAX_ALERT_SEND_ATTEMPTS = 5
