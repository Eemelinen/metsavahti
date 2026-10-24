import { getPayload } from 'payload'
import config from '@payload-config'
import { mapImageResponse } from '@/lib/alerts/map-image'

export const dynamic = 'force-dynamic'

/**
 * Static map image of an alert for the alert email (`01 §6`, MV-077): owner session or the
 * signed `?token=` from the email. Logic and access rules: `lib/alerts/map-image.ts`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  return mapImageResponse(payload, request, (await params).id)
}
