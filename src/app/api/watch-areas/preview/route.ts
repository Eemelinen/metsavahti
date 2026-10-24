import { getPayload } from 'payload'

import config from '@payload-config'
import { requireUser } from '@/lib/auth/guards'
import { toErrorResponse } from '@/lib/errors'
import { previewQuerySchema, watchAreaPreview } from '@/lib/watch-areas/preview'

export const dynamic = 'force-dynamic'

/**
 * Count and polygons of the declarations in force inside a not-yet-saved watch area
 * (`01 §6`, E05 MV-063; the wizard's radius step, MV-065): `?lng&lat&radius` (WGS 84,
 * metres) → `{ ok: true, data: { count, geojson } }`, 400 on a bad query, 401 without a
 * session, 429 when a live WFS fetch is over its limit. Logic: `lib/watch-areas/preview.ts`.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const parsed = previewQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    if (!parsed.success) {
      return Response.json({ ok: false, error: 'invalid_query' }, { status: 400 })
    }
    const { lng, lat, radius } = parsed.data
    const payload = await getPayload({ config })
    const data = await watchAreaPreview(payload, user.id, [lng, lat], radius)
    return Response.json({ ok: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return toErrorResponse(error)
  }
}
