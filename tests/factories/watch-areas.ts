import type { Payload } from 'payload'

import type { LonLat } from '@/lib/geo/crs'
import type { WatchArea } from '@/payload-types'
import { SAMPLE_WATCH_AREA } from '../fixtures/sample-area'

export type WatchAreaOverrides = { name?: string; center?: LonLat; radiusM?: number }

/**
 * A watch area owned by `ownerId`, created through the Local API so the generated
 * `geom_3067` circle is real. Defaults to `SAMPLE_WATCH_AREA`, the 1 km circle the WFS
 * fixture set was recorded around.
 */
export async function createWatchArea(
  payload: Payload,
  ownerId: number,
  overrides: WatchAreaOverrides = {},
): Promise<WatchArea> {
  return payload.create({
    collection: 'watch-areas',
    data: {
      name: overrides.name ?? SAMPLE_WATCH_AREA.name,
      center: overrides.center ?? [SAMPLE_WATCH_AREA.center.lng, SAMPLE_WATCH_AREA.center.lat],
      radiusM: overrides.radiusM ?? SAMPLE_WATCH_AREA.radiusM,
      owner: ownerId,
    },
    overrideAccess: true,
  })
}
