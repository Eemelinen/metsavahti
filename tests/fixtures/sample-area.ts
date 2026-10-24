import { to3067 } from '@/lib/geo/crs'

/**
 * Watch area the recorded WFS fixture set is built around (MV-021): a 1 km circle in
 * Sipoo, north-east of Helsinki, EPSG:3067 ≈ (403 500, 6 692 000). On 2026-10-24 its
 * padded request box held 19 stands in force from 10 declarations with 7 cutting methods:
 * 6 inside the circle, 4 crossing its edge and 9 outside it (`tests/fixtures/wfs/manifest.json`).
 *
 * Same shape as a watch area (`watchAreaFormSchema`: WGS 84 centre, radius in metres).
 * Re-record the set with `pnpm fixtures:record --set`.
 */
export const SAMPLE_WATCH_AREA = {
  name: 'Sipoo testialue',
  center: { lng: 25.251118, lat: 60.352954 },
  radiusM: 1000,
} as const

/** Centre of `SAMPLE_WATCH_AREA` in EPSG:3067. */
export const SAMPLE_WATCH_AREA_CENTER_3067 = to3067([
  SAMPLE_WATCH_AREA.center.lng,
  SAMPLE_WATCH_AREA.center.lat,
])
