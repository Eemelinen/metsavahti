import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'

import { env } from '@/lib/env'
import {
  type MatchedDeclaration,
  type RemovedMatch,
  findRemovedMatches,
  matchWatchAreas as matchPairs,
  recordWatchAreaChecks,
  storeSeenHashes,
} from '@/lib/geo/spatial-queries'
import type { JobContext } from '@/lib/jobs/context'
import type { AlertChangeType, AlertSnapshot } from '@/payload/collections/Alerts'

export type MatchWatchAreasResult = {
  /** Watch areas checked (owner not being deleted). */
  watchAreas: number
  /** Declarations those areas match now: the sum of their `lastDeclarationCount`s. */
  matched: number
  alertsCreated: number
  new: number
  geometryChanged: number
  attributesChanged: number
  removed: number
}

export type MatchWatchAreasOptions = {
  /** Create `removed` alerts (`01 §4.2`); defaults to `ALERT_ON_REMOVED=1`. */
  alertOnRemoved?: boolean
}

/** One alert per pair and run; a geometry change wins over an attribute change. */
function changeTypeOf(m: MatchedDeclaration): AlertChangeType {
  if (m.inserted) return 'new'
  return m.lastSeenGeomHash !== m.geomHash ? 'geometry_changed' : 'attributes_changed'
}

/**
 * The `match-watch-areas` step (`01 §4.2`, MV-072): match every watch area against the
 * stored declarations, alert the owner of each new pair (`new`) and of each recorded pair
 * whose geometry or attributes changed since it was last seen (`geometry_changed` /
 * `attributes_changed`), then store the current hashes on the pairs. With `alertOnRemoved`
 * a recorded pair whose declaration was removed since the area's last check alerts
 * `removed`. Finally every area gets `lastCheckedAt` and `lastDeclarationCount`. The alert
 * snapshot freezes what the feed and the email show (`01 §3.5`).
 *
 * Everything runs in one transaction: a failing run leaves no half-recorded pairs behind,
 * so its retry alerts the same changes again instead of losing them.
 */
export async function matchWatchAreas(
  ctx: JobContext,
  { alertOnRemoved = env.ALERT_ON_REMOVED === '1' }: MatchWatchAreasOptions = {},
): Promise<MatchWatchAreasResult> {
  const { payload, logger } = ctx
  const now = ctx.now()
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    const result = { new: 0, geometryChanged: 0, attributesChanged: 0, removed: 0 }

    const createAlert = async (
      m: MatchedDeclaration | RemovedMatch,
      changeType: AlertChangeType,
    ) => {
      const snapshot: AlertSnapshot = {
        cuttingTypeLabel: m.cuttingTypeLabel,
        areaHa: m.areaHa,
        distanceM: Math.round(m.distanceM),
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
        depth: 0,
        overrideAccess: true,
        req,
      })
    }

    const matches = await matchPairs(payload, now, req)
    for (const m of matches) {
      const changeType = changeTypeOf(m)
      await createAlert(m, changeType)
      if (changeType === 'new') result.new += 1
      else if (changeType === 'geometry_changed') result.geometryChanged += 1
      else result.attributesChanged += 1
    }
    await storeSeenHashes(
      payload,
      matches.filter((m) => !m.inserted),
      req,
    )

    if (alertOnRemoved) {
      for (const m of await findRemovedMatches(payload, req)) {
        await createAlert(m, 'removed')
        result.removed += 1
      }
    }

    const checked = await recordWatchAreaChecks(payload, now, req)
    await commitTransaction(req)

    const out: MatchWatchAreasResult = {
      watchAreas: checked.watchAreas,
      matched: checked.declarations,
      alertsCreated: matches.length + result.removed,
      ...result,
    }
    logger.info(out, 'match-watch-areas done')
    return out
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}
