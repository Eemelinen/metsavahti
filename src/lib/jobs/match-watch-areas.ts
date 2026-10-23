import { findUnrecordedMatches } from '@/lib/geo/spatial-queries'
import type { JobContext } from '@/lib/jobs/context'
import type { AlertChangeType, AlertSnapshot } from '@/payload/collections/Alerts'

export type MatchWatchAreasResult = { matched: number; alertsCreated: number }

/**
 * Record every intersecting (watch area, declaration) pair in `watch_area_declarations`
 * and create an alert for the owner when the pair is new or its geometry changed
 * (`01 §3.4–3.5`). An attribute-only change updates the stored `lastSeenAttrHash` without
 * an alert until MV-072 turns the `attributes_changed` rule on (D-006, ledger D5).
 */
export async function matchWatchAreas(ctx: JobContext): Promise<MatchWatchAreasResult> {
  const { payload, logger, now } = ctx
  const matches = await findUnrecordedMatches(payload)
  const matchedAt = now().toISOString()

  let alertsCreated = 0
  for (const m of matches) {
    const distanceM = Math.round(m.distanceM)
    const seen = {
      lastMatchedAt: matchedAt,
      lastSeenGeomHash: m.geomHash,
      lastSeenAttrHash: m.attrHash,
      distanceM,
    }

    let changeType: AlertChangeType | null
    if (m.watchAreaDeclarationId === null) {
      await payload.create({
        collection: 'watch-area-declarations',
        data: {
          watchArea: m.watchAreaId,
          declaration: m.declarationId,
          firstMatchedAt: matchedAt,
          ...seen,
        },
        overrideAccess: true,
      })
      changeType = 'new'
    } else {
      await payload.update({
        collection: 'watch-area-declarations',
        id: m.watchAreaDeclarationId,
        data: seen,
        overrideAccess: true,
      })
      changeType = m.lastSeenGeomHash !== m.geomHash ? 'geometry_changed' : null
    }
    if (changeType === null) continue

    const snapshot: AlertSnapshot = {
      cuttingTypeLabel: m.cuttingTypeLabel,
      areaHa: m.areaHa,
      distanceM,
      receivedAt: m.receivedAt,
    }
    await payload.create({
      collection: 'alerts',
      data: {
        user: m.ownerId,
        watchArea: m.watchAreaId,
        declaration: m.declarationId,
        changeType,
        snapshot,
      },
      overrideAccess: true,
    })
    alertsCreated += 1
  }

  const result = { matched: matches.length, alertsCreated }
  logger.info(result, 'match-watch-areas done')
  return result
}
