import type { FeatureCollection, MultiPolygon } from 'geojson'
import type { Payload } from 'payload'
import { z } from 'zod'

import { wfs as wfsConfig } from '@/config/wfs'
import { env } from '@/lib/env'
import { bboxForWatchArea, snapBboxToGrid } from '@/lib/geo/bbox'
import { isInsideFinland, type LonLat, to3067 } from '@/lib/geo/crs'
import {
  type DeclarationMapProperties,
  isBboxFetched,
  previewCount,
  previewDeclarations,
  recordBboxFetch,
  upsertDeclarations,
} from '@/lib/geo/spatial-queries'
import { createRateLimiter, rateLimitKey } from '@/lib/rate-limit'
import { MAX_RADIUS_M, MIN_RADIUS_M } from '@/lib/watch-areas/watch-area-schema'
import { MetsakeskusWfsClient, type WfsClient } from '@/lib/wfs/client'
import { normaliseFeatures } from '@/lib/wfs/normalise'

/**
 * The watch-area preview (`GET /api/watch-areas/preview`, `01 §6`, E05 MV-063): how many
 * declarations in force a not-yet-saved circle would match, and their polygons for the map.
 * Answers from the local `declarations` cache; when the boxes fetched before do not cover the
 * circle's padded box, it first fetches that box (snapped out to `wfs.previewFetchCellM`) live
 * from the WFS, at most 5 times a minute per user, and records it in `wfs_bbox_fetches` (D-036).
 */

/** `?lng&lat&radius` of the preview: a WGS 84 centre in Finland and a watch-area radius in metres. */
export const previewQuerySchema = z
  .object({
    lng: z.coerce.number().min(-180).max(180),
    lat: z.coerce.number().min(-90).max(90),
    radius: z.coerce.number().int().min(MIN_RADIUS_M).max(MAX_RADIUS_M),
  })
  .refine(({ lng, lat }) => isInsideFinland(to3067([lng, lat])), { path: ['lng'] })

/** Live WFS fetches of the preview: 5 per minute per user (`01 §6`). Cache hits are not counted. */
export const previewFetchRateLimiter = createRateLimiter({
  name: 'preview-fetch',
  limit: 5,
  windowMs: 60 * 1000,
})

export type WatchAreaPreview = {
  count: number
  geojson: FeatureCollection<MultiPolygon, DeclarationMapProperties>
}

export type WatchAreaPreviewOptions = {
  /** Injected in tests; defaults to the Metsäkeskus client from `env`. */
  wfs?: WfsClient
  now?: Date
}

/**
 * The preview of a circle around `center` for `userId`. A cold box costs one slot of
 * `previewFetchRateLimiter` (throws `RateLimited` when none is left) and one paged WFS fetch
 * (`ExternalServiceError` when it fails; nothing is recorded then, so the next preview retries).
 */
export async function watchAreaPreview(
  payload: Payload,
  userId: number,
  center: LonLat,
  radiusM: number,
  { wfs, now = new Date() }: WatchAreaPreviewOptions = {},
): Promise<WatchAreaPreview> {
  const needed = bboxForWatchArea(center, radiusM)
  if (!(await isBboxFetched(payload, needed))) {
    await previewFetchRateLimiter.assert(rateLimitKey('watch-area-preview', { userId }))
    const box = snapBboxToGrid(needed, wfsConfig.previewFetchCellM)
    const client =
      wfs ?? new MetsakeskusWfsClient({ baseUrl: env.WFS_BASE_URL, layer: env.WFS_LAYER })
    let fetched = 0
    for await (const page of client.getFeaturesByBbox(box)) {
      await upsertDeclarations(payload, normaliseFeatures(page), now)
      fetched += page.features.length
    }
    await recordBboxFetch(payload, box, fetched, now)
  }
  const [count, geojson] = await Promise.all([
    previewCount(payload, center, radiusM, now),
    previewDeclarations(payload, center, radiusM, now),
  ])
  return { count, geojson }
}
