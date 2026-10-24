import { getPayload } from 'payload'

import config from '@payload-config'
import { unsubscribeResponse } from '@/lib/notifications/unsubscribe'

export const dynamic = 'force-dynamic'

/**
 * The unsubscribe link of the alert emails (`01 §6`, MV-073): turns off notifications for one
 * watch area without a session, then 303 to `/ilmoitukset-lopetettu`; 400 for a forged token.
 * Logic: `lib/notifications/unsubscribe.ts`.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config })
  return unsubscribeResponse(payload, request)
}
