/**
 * maplibre-gl 6 runs its parsing (GeoJSON, tiles) in a module worker that it looks for next to
 * its own bundle file (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). Next's bundles
 * do not contain that file, so without help the worker never starts: raster tiles still show,
 * but GeoJSON layers stay empty and the map never fires `load` or `idle` (MV-060, D-035).
 * `src/app/maplibre-gl/[version]/[file]/route.ts` serves the two files from the installed
 * package and `MapView` points `setWorkerUrl()` at them.
 */

/** The worker and the shared chunk it imports (`./maplibre-gl-shared.mjs`). */
export const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'] as const

/** Same-origin URL of the worker; the version in the path keeps cached copies in step. */
export function maplibreWorkerUrl(version: string): string {
  return `/maplibre-gl/${version}/maplibre-gl-worker.mjs`
}
