import { getPayload } from 'payload'

import config from '@payload-config'
import { postgisVersion } from '@/lib/geo/spatial-queries'

export const dynamic = 'force-dynamic'

/** Liveness + DB readiness. Used by Playwright's webServer wait and by uptime checks. */
export async function GET() {
  try {
    const payload = await getPayload({ config })
    const postgis = await postgisVersion(payload)
    return Response.json({ ok: true, db: 'up', postgis })
  } catch (err) {
    return Response.json(
      { ok: false, db: 'down', error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    )
  }
}
