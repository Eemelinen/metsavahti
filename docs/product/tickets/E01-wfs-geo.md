# E01 — WFS Client & Geo Library (MV-020…MV-029)

Pure library work under `src/lib/geo` and `src/lib/wfs`. No DB except MV-029. Unit-test heavy.

### MV-020 CRS module

**Goal:** `crs.ts` registering EPSG:3067 in proj4; `to3067`, `toWgs84`, GeoJSON reprojection helpers (`reprojectFeature`). **Acceptance:** round-trip error < 1 mm for 5 known control points (Helsinki, Joensuu, Rovaniemi, Vaasa, Utsjoki). **Tests:** unit. **Depends on:** MV-003

### MV-021 Discover and pin WFS layer contract and record fixtures

**Goal:** Script `pnpm wfs:describe` that calls `GetCapabilities` + `DescribeFeatureType`, prints layer names/attributes for the metsänkäyttöilmoitus layer; pin results in `src/lib/wfs/layer.ts` (layer name, attribute names, id field, date fields, cutting type field). Record `tests/fixtures/wfs/capabilities.xml` and `describe.xml`. Then `pnpm fixtures:record --bbox <3067 bbox> --name <name>` writing GeoJSON pages to `tests/fixtures/wfs/`; produce the fixture set listed in `05-conventions.md` (inside/outside/borderline/changed-_/empty/paged-_). Choose a real bbox with several declarations and define `SAMPLE_WATCH_AREA` (centre + radius) in `tests/fixtures/sample-area.ts` such that fixtures are meaningful. **Acceptance:** `layer.ts` documented with the discovery date; Zod schema `WfsFeatureSchema` matches real attributes; fixtures < 2 MB total, anonymised if any personal fields exist (there should be none). **Tests:** unit: schema parses recorded fixtures. **Status:** absorbs MV-022 (merged 2026-09-20, ledger P11). **Depends on:** MV-003 (network allowed for this ticket only)

### MV-023 WFS client

**Goal:** `WfsClient` interface + `MetsakeskusWfsClient` (`client.ts`): `getFeaturesByBbox(bbox3067, { pageSize, startIndex })` async iterator over pages; timeouts, `p-retry` (3, exponential), JSON output with GML fallback via `fast-xml-parser`; `ExternalServiceError` on failure. **Tests:** unit with MSW: paging, retry on 502, timeout, GML fallback path. **Depends on:** MV-021

### MV-024 Normalisation, cutting-type codes and Finnish labels

**Goal:** `normalise.ts`: `WfsFeature` → `NormalisedDeclaration` (sourceId, cuttingTypeCode/Label, areaHa, receivedAt, validUntil, municipalityCode, rawAttributes, geometry MultiPolygon 3067). `codes.ts`: code → `{ label_fi, colourToken, severity }` from `config/cutting-types.ts`, unknown → `muu`. Populate `config/cutting-types.ts` with the real Metsäkeskus codes discovered in MV-021 and plain-Finnish labels + one-line explanations for UI ("Harvennushakkuu — osa puista poistetaan…"). **Tests:** unit on every fixture; unknown code path; date parsing edge cases; every code in fixtures has a label. **Status:** absorbs MV-028 (merged 2026-09-20, ledger P11). **Depends on:** MV-021

### MV-025 Geometry hashing

**Goal:** `hash.ts`: canonical WKB via `wkx` (coordinates rounded to 1 cm, rings ordered) → sha256; `attrHash` via stable stringify. **Tests:** unit: same geometry different vertex order → same hash; 2 cm move → different hash. **Depends on:** MV-020

### MV-026 Bbox and clustering

**Goal:** `bbox.ts`: `bboxForWatchArea(center4326, radiusM, paddingM)` in 3067; `clusterBboxes(areas, cellSizeM)` → minimal set of merged bboxes each ≤ `wfs.maxBboxSizeM`. **Tests:** unit: 1 000 random areas → ≤ 200 bboxes; every area fully inside at least one bbox. **Depends on:** MV-020

### MV-027 Client-side buffer preview helper

**Goal:** `buffer.ts`: `previewCircle(center4326, radiusM)` → GeoJSON polygon via turf (for map preview only). **Tests:** unit: area within 1 % of πr². **Depends on:** MV-020

### MV-029 Live contract test

**Goal:** `tests/live/wfs.contract.test.ts`: GetCapabilities OK, DescribeFeatureType attributes ⊇ pinned attributes, one bbox GetFeature parses with `WfsFeatureSchema`. Runs only with `RUN_LIVE=1`; wired into `nightly.yml`. **Acceptance:** failure message names missing/renamed attributes. **Depends on:** MV-023, MV-009
