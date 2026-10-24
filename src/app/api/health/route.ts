import { getPayload } from 'payload'

import config from '@payload-config'
import { postgisVersion } from '@/lib/geo/spatial-queries'
import { isWfsReachable, pipelineHealthAt } from '@/lib/health'

export const dynamic = 'force-dynamic'

/**
 * Liveness + DB readiness, used by Playwright's webServer wait and by uptime checks, plus the
 * last pipeline run and `stale` (MV-075). Only a database failure answers 503: a stale or
 * failed pipeline is reported in the body, so the app stays "up" before its first run.
 * `?deep=1` also asks the WFS for its capabilities (`wfsReachable`).
 */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get('deep') === '1'
  try {
    const payload = await getPayload({ config })
    const [postgis, pipeline, wfsReachable] = await Promise.all([
      postgisVersion(payload),
      pipelineHealthAt(payload, new Date()),
      deep ? isWfsReachable() : undefined,
    ])
    return Response.json({ ok: true, db: 'up', postgis, ...pipeline, wfsReachable })
  } catch (err) {
    return Response.json(
      { ok: false, db: 'down', error: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    )
  }
}
