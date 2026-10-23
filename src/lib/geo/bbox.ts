import { wfs } from '@/config/wfs'
import type { Bbox } from '@/lib/geo/buffer'
import { type LonLat, to3067 } from '@/lib/geo/crs'

/**
 * WFS request boxes for watch areas (MV-026).
 *
 * `bboxForWatchArea` turns one watch area (WGS 84 centre + radius) into a padded square
 * in EPSG:3067 metres. `clusterBboxes` merges many such squares into as few request
 * boxes as it can while keeping every box within `wfs.maxBboxSizeM` and every area
 * fully inside at least one box, so one paged `GetFeature` per box sees every
 * declaration that can touch any watch area.
 */

export type ClusterOptions = {
  /** Longest side (metres) a merged box may have. Defaults to `wfs.maxBboxSizeM`. */
  maxBboxSizeM?: number
}

function assertFinite(name: string, value: number, min: number, inclusive: boolean): void {
  const ok = Number.isFinite(value) && (inclusive ? value >= min : value > min)
  if (!ok) {
    throw new RangeError(
      `${name} must be a finite number ${inclusive ? '≥' : '>'} ${min}, got ${value}`,
    )
  }
}

/**
 * Axis-aligned square in EPSG:3067 around `center4326` whose half-side is
 * `radiusM + paddingM`. Computed in the projected CRS, so it is exact in metres.
 */
export function bboxForWatchArea(
  center4326: LonLat,
  radiusM: number,
  paddingM: number = wfs.bboxPaddingM,
): Bbox {
  assertFinite('radiusM', radiusM, 0, false)
  assertFinite('paddingM', paddingM, 0, true)
  const [e, n] = to3067(center4326)
  const half = radiusM + paddingM
  return [e - half, n - half, e + half, n + half]
}

function union(a: Bbox, b: Bbox): Bbox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

function fits(bbox: Bbox, maxSizeM: number): boolean {
  return bbox[2] - bbox[0] <= maxSizeM && bbox[3] - bbox[1] <= maxSizeM
}

function area(bbox: Bbox): number {
  return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
}

/** True when `inner` lies entirely within `outer` (edges may touch). */
export function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
  )
}

type Seed = { row: number; col: number; bbox: Bbox }

/**
 * Groups area boxes into request boxes.
 *
 * 1. Every area box is assigned to the `cellSizeM` grid cell that holds its centre; the
 *    areas of one cell become one seed box (their union) when that union fits within
 *    `maxBboxSizeM`, otherwise each area stays its own seed.
 * 2. Seeds are visited in grid order (south to north, west to east) and each is merged
 *    into the existing request box whose union with it is the smallest that still fits;
 *    when none fits it opens a new request box.
 *
 * The result depends only on the set of input boxes, not on their order. Every input box
 * is contained in at least one output box and every output box has sides ≤
 * `maxBboxSizeM`. The set is small (greedy best-fit), not provably minimal.
 *
 * @throws RangeError when `cellSizeM` or `maxBboxSizeM` is not positive, or when an area
 *   box is inverted or wider/taller than `maxBboxSizeM` (no request box could hold it).
 */
export function clusterBboxes(
  areas: readonly Bbox[],
  cellSizeM: number = wfs.clusterCellSizeM,
  { maxBboxSizeM = wfs.maxBboxSizeM }: ClusterOptions = {},
): Bbox[] {
  assertFinite('cellSizeM', cellSizeM, 0, false)
  assertFinite('maxBboxSizeM', maxBboxSizeM, 0, false)

  const cells = new Map<string, { row: number; col: number; members: Bbox[] }>()
  areas.forEach((bbox, index) => {
    const [minE, minN, maxE, maxN] = bbox
    if (![minE, minN, maxE, maxN].every(Number.isFinite) || minE > maxE || minN > maxN) {
      throw new RangeError(`areas[${index}] is not a valid bbox: ${JSON.stringify(bbox)}`)
    }
    if (!fits(bbox, maxBboxSizeM)) {
      throw new RangeError(
        `areas[${index}] is ${maxE - minE} × ${maxN - minN} m, larger than maxBboxSizeM ${maxBboxSizeM}`,
      )
    }
    const col = Math.floor((minE + maxE) / 2 / cellSizeM)
    const row = Math.floor((minN + maxN) / 2 / cellSizeM)
    const key = `${row}:${col}`
    const cell = cells.get(key)
    if (cell) cell.members.push(bbox)
    else cells.set(key, { row, col, members: [bbox] })
  })

  const seeds: Seed[] = []
  for (const { row, col, members } of cells.values()) {
    const merged = members.reduce(union)
    if (fits(merged, maxBboxSizeM)) seeds.push({ row, col, bbox: merged })
    else for (const bbox of members) seeds.push({ row, col, bbox })
  }
  seeds.sort(
    (a, b) =>
      a.row - b.row ||
      a.col - b.col ||
      a.bbox[0] - b.bbox[0] ||
      a.bbox[1] - b.bbox[1] ||
      a.bbox[2] - b.bbox[2] ||
      a.bbox[3] - b.bbox[3],
  )

  const clusters: Bbox[] = []
  for (const seed of seeds) {
    let bestIndex = -1
    let bestArea = Number.POSITIVE_INFINITY
    let best: Bbox | undefined
    clusters.forEach((cluster, index) => {
      const candidate = union(cluster, seed.bbox)
      if (!fits(candidate, maxBboxSizeM)) return
      const candidateArea = area(candidate)
      if (candidateArea < bestArea) {
        bestArea = candidateArea
        bestIndex = index
        best = candidate
      }
    })
    if (best) clusters[bestIndex] = best
    else clusters.push([...seed.bbox])
  }
  return clusters
}
