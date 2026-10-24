import { bboxForWatchArea, clusterBboxes } from '@/lib/geo/bbox'
import type { Bbox } from '@/lib/geo/buffer'
import type { LonLat } from '@/lib/geo/crs'
import { markMissing, upsertDeclarations } from '@/lib/geo/spatial-queries'
import type { JobContext } from '@/lib/jobs/context'
import { normaliseFeatures } from '@/lib/wfs/normalise'

export type FetchDeclarationsResult = {
  /** Watch areas whose owner is not being deleted. */
  watchAreas: number
  /** Request boxes after clustering (`clusterBboxes`). */
  bboxes: number
  /** Boxes whose fetch or write failed; their declarations were not counted missing. */
  failedBboxes: number
  /** `GetFeature` pages requested, the failing one of a box included (client retries not). */
  requests: number
  /** Features received, counted once per box that returned them. */
  features: number
  /** Declarations stored for the first time. */
  inserted: number
  /** Stored declarations whose geometry or attributes changed (one revision each). */
  updated: number
  /** Declarations that reached `wfs.missingRunsBeforeRemoval` and got `removedAt`. */
  removed: number
}

type BboxResult = Pick<FetchDeclarationsResult, 'features' | 'inserted' | 'updated' | 'removed'>

/**
 * Thrown when every box of a run failed: nothing was fetched, so the run is `failed`. The
 * message ends with the last box's error, which lands in `job_runs.error`.
 */
class FetchDeclarationsError extends Error {
  constructor(failed: number, cause: unknown) {
    const last = cause instanceof Error ? cause.message : String(cause)
    super(`all ${failed} request boxes failed; last: ${last}`, { cause })
    this.name = 'FetchDeclarationsError'
  }
}

/** `partial` when some boxes failed and others did not (`01 §4.1` step 6). */
export function fetchDeclarationsStatus(result: FetchDeclarationsResult): 'succeeded' | 'partial' {
  return result.failedBboxes > 0 ? 'partial' : 'succeeded'
}

/**
 * The `fetch-declarations` step (`01 §4.1`, MV-071): load the watch areas of accounts not
 * being deleted, turn them into padded EPSG:3067 boxes and cluster those (`lib/geo/bbox.ts`),
 * then per box read every `GetFeature` page, normalise it and bulk-upsert it
 * (`upsertDeclarations`, revisions on a hash change). Once all pages of a box arrived, the
 * stored declarations of that box that were not among them count one missing run
 * (`markMissing`, removed after 3). A box that fails (after the client's retries) is logged
 * and skipped without counting misses, and the other boxes go on; the result reports it in
 * `failedBboxes` (status `partial`). When every box fails the step throws. One `now` serves
 * the whole run, which `markMissing()`'s once-per-run guard relies on.
 */
export async function fetchDeclarations(ctx: JobContext): Promise<FetchDeclarationsResult> {
  const { payload, logger } = ctx
  const now = ctx.now()
  const { docs: areas } = await payload.find({
    collection: 'watch-areas',
    where: { 'owner.deletedAt': { exists: false } },
    select: { center: true, radiusM: true },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  const bboxes = clusterBboxes(
    areas.map((area) => bboxForWatchArea(area.center as LonLat, area.radiusM)),
  )

  const result: FetchDeclarationsResult = {
    watchAreas: areas.length,
    bboxes: bboxes.length,
    failedBboxes: 0,
    requests: 0,
    features: 0,
    inserted: 0,
    updated: 0,
    removed: 0,
  }
  let lastError: unknown

  for (const bbox of bboxes) {
    let pages = 0
    try {
      const counts = await fetchBbox(ctx, bbox, now, () => (pages += 1))
      result.requests += pages
      result.features += counts.features
      result.inserted += counts.inserted
      result.updated += counts.updated
      result.removed += counts.removed
    } catch (err) {
      result.requests += pages + 1
      result.failedBboxes += 1
      lastError = err
      logger.error({ err, bbox, pages }, 'fetch-declarations: request box failed')
    }
  }

  if (bboxes.length > 0 && result.failedBboxes === bboxes.length) {
    throw new FetchDeclarationsError(result.failedBboxes, lastError)
  }
  logger.info(result, 'fetch-declarations done')
  return result
}

async function fetchBbox(
  { payload, wfs, logger }: JobContext,
  bbox: Bbox,
  now: Date,
  onPage: () => void,
): Promise<BboxResult> {
  const seen = new Set<string>()
  const counts: BboxResult = { features: 0, inserted: 0, updated: 0, removed: 0 }
  for await (const page of wfs.getFeaturesByBbox(bbox)) {
    onPage()
    const declarations = normaliseFeatures(page)
    for (const d of declarations) seen.add(d.sourceId)
    counts.features += declarations.length
    const upserted = await upsertDeclarations(payload, declarations, now)
    counts.inserted += upserted.inserted
    counts.updated += upserted.updated
    logger.debug({ bbox, features: declarations.length }, 'wfs page stored')
  }
  counts.removed = (await markMissing(payload, bbox, [...seen], now)).removed
  return counts
}
