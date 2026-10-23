/**
 * Time zones of an account (`users.timezone`, `01 §3.1`). Browser-safe: the `/tili` form
 * validates with the same check as the `users` collection.
 */

export const DEFAULT_TIMEZONE = 'Europe/Helsinki'

/** IANA zone check through `Intl`; Node and browsers ship the full tz database. */
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
 * The zones `/tili` offers (App artboard `tili`: Europe/Helsinki, Europe/Stockholm): Finland
 * first, then its neighbours and the zones a Finnish forest owner abroad most likely lives in.
 * The digest hour (`notificationPrefs.dailyHour`) is read in this zone.
 */
export const TIMEZONE_OPTIONS: readonly string[] = [
  DEFAULT_TIMEZONE,
  'Europe/Stockholm',
  'Europe/Tallinn',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Madrid',
  'UTC',
]

/** The select's options: the list above, plus the account's own zone when an admin set another. */
export function timezoneOptions(current: string | null | undefined): string[] {
  return current && !TIMEZONE_OPTIONS.includes(current) && isValidTimeZone(current)
    ? [current, ...TIMEZONE_OPTIONS]
    : [...TIMEZONE_OPTIONS]
}
