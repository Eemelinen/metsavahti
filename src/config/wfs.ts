/**
 * Metsäkeskus WFS query constants (spec `01 §11`, ledger R12).
 *
 * The pipeline never downloads whole municipalities: watch areas are grouped into
 * EPSG:3067 bounding boxes and each box is one paged `GetFeature` request
 * (`01 §2`, `§4.1`). These constants shape those boxes; see `src/lib/geo/bbox.ts`.
 */
export const wfs = {
  /**
   * Grid cell (metres) used to group watch areas before neighbouring groups are merged
   * (`01 §4.1`: "cluster with a simple grid (cell 20 km)").
   */
  clusterCellSizeM: 20_000,
  /**
   * Margin (metres) added around every watch-area bbox. Anything intersecting the watch
   * circle already intersects the unpadded box; the margin absorbs CRS round-trip and
   * geometry-simplification error at the edge.
   */
  bboxPaddingM: 500,
  /**
   * Longest side (metres) a single `GetFeature` bbox may have. Large enough that 1 000
   * watch areas spread over the whole country still fit in ≤ 200 requests
   * (`01 §13`), small enough that one box stays at a few pages of 1 000 features.
   */
  maxBboxSizeM: 100_000,
} as const
