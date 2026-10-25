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
   * (`01 §13`). A dense southern box of this size held 33 416 declarations in force on
   * 2026-10-24 (34 pages of 1 000, ~1.3 s each); D-012 keeps the cap until MV-071 / MV-079
   * measure real request counts.
   */
  maxBboxSizeM: 100_000,
  /**
   * Features per `GetFeature` page (`count`). A full page of 1 000 measured ~1.3 s and
   * ~2.9 MB on 2026-10-24 (D-012); the server's `CountDefault` caps it at 10 000.
   */
  pageSize: 1_000,
  /**
   * Consecutive runs a stored declaration may be missing from its bbox's results before
   * it gets `removedAt` (`01 §3.3`, `§4.1` step 5; `markMissing()` in
   * `src/lib/geo/spatial-queries.ts`).
   */
  missingRunsBeforeRemoval: 3,
  /**
   * Grid (metres, EPSG:3067) the preview endpoint snaps its live-fetch box out to (MV-063):
   * a cold preview fetches whole cells, so moving the pin a little or changing the radius
   * stays inside boxes already fetched. A 5 000 m radius box (11 km padded) spans at most
   * 3 × 3 cells.
   */
  previewFetchCellM: 5_000,
  /** Rows per `upsertDeclarations()` statement (`01 §4.1` step 4: transactions of 500). */
  upsertBatchSize: 500,
  /**
   * Metsäkeskus' own map of the declarations it has received ("Karttanäkymä: Metsäkeskukseen
   * toimitetut metsänkäyttöilmoitukset", an ArcGIS Experience linked from
   * metsakeskus.fi → Avoin metsä- ja luontotieto → Hakkuuaikomukset, checked on 2026-10-24).
   * The alert page links it as "Metsäkeskuksen karttapalvelu" (MV-082). The page documents no
   * parameters for a position or a declaration, so the link opens the whole map (ledger R47).
   */
  mapServiceUrl: 'https://experience.arcgis.com/experience/bc56dcb749f84297aad54c8371a11fdd',
} as const
