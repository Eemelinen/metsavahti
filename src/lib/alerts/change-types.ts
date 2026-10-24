import { env } from '@/lib/env'
import { ALERT_CHANGE_TYPES, type AlertChangeType } from '@/payload/collections/Alerts'

/**
 * The change types the app shows (MV-080): `removed` only while `ALERT_ON_REMOVED=1`
 * (`01 §4.2`), so removal alerts recorded before the flag was turned off stay out of the feed
 * and the badge. Labels and explanations live in `fi.alerts.changeType`.
 */
export function visibleChangeTypes(
  showRemoved: boolean = env.ALERT_ON_REMOVED === '1',
): AlertChangeType[] {
  return ALERT_CHANGE_TYPES.filter((type) => showRemoved || type !== 'removed')
}
