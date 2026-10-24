import { getPayload } from 'payload'
import config from '@payload-config'
import { consentResponse } from '@/lib/consent/record-consent'

export const dynamic = 'force-dynamic'

/**
 * Cookie consent (`01 §6`, `01 §8`, MV-090): sets `mv_consent` and, for a signed-in account,
 * appends a `cookies` consent event. Logic: `lib/consent/record-consent.ts`.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })
  return consentResponse(payload, request)
}
