# E05 — Watch Areas: CRUD + Map (MV-060…MV-069)

### MV-060 MapView component

**Goal:** `src/components/map/MapView.tsx` (MapLibre + react-map-gl): base raster (OSM in dev, `MAP_TILE_URL` env), optional Metsäkeskus WMS toggle layer, declarations GeoJSON layer styled by `cuttingType` colour token, watch-area circle/polygon layer, legend, "Keskitä" control, keyboard-operable controls, attribution control, `onCenterChange` with draggable pin in interactive mode; SSR-safe dynamic import. **Tests:** unit: renders legend and handles props without WebGL (mock maplibre); E2E visual snapshot on fixed style (`@visual` tag, not in smoke). **Depends on:** MV-005, MV-027, MV-024

### MV-061 Declaration popover

**Goal:** Click polygon → popover with cutting type chip, area ha, received date, distance, "Näytä tiedot" link. Accessible alternative: focusable list under the map mirrors polygons. **Tests:** unit. **Depends on:** MV-060

### MV-062 Geocoding proxy

**Goal:** `GET /api/geocode?q=` → MML geocoding (or Digitransit) behind `Geocoder` interface; Zod-validated output `{ label, lng, lat, municipality }[]`; 24 h in-memory + DB cache; rate limit 60/min/user. `AddressSearch` combobox component (debounce 300 ms, arrow-key navigation). **Tests:** unit with MSW; integration rate limit; E2E with mocked geocoder (`GEOCODER=mock` returns fixtures). **Depends on:** MV-048, MV-046

### MV-063 Preview endpoint

**Goal:** `GET /api/watch-areas/preview?lng&lat&radius` → `{ count, geojson }` from local `declarations` via `previewCount`; if the bbox has never been fetched (tracked in `wfs_bbox_fetches` table, migration `0005`), perform one live bbox fetch through `WfsClient` (rate limit 5/min/user) then answer. **Tests:** integration: cold bbox triggers exactly one mocked WFS call; warm bbox none. **Depends on:** MV-037, MV-023, MV-048

### MV-064 Watch-area Server Actions

**Goal:** `createWatchArea`, `updateWatchArea`, `deleteWatchArea`, `toggleWatchAreaNotifications`; Zod schemas; plan-limit error mapped to UI; `update` nulls `lastCheckedAt`; delete cascades join rows/alerts (DB FK `ON DELETE CASCADE` via migration `0006`). **Tests:** integration: ownership, limits, cascade. **Depends on:** MV-032, MV-046

### MV-065 Onboarding wizard `/aloita`

**Goal:** 3-step wizard per `03-pages.md`: AddressSearch/geolocation/map pin → RadiusPicker with live preview count → name + notify toggle → save → redirect. State in a reducer; back/next; skip link. **Tests:** unit reducer; E2E `@smoke`: create first watch area with mocked geocoder + WFS mock. **Depends on:** MV-060, MV-062, MV-063, MV-064

### MV-066 Dashboard `/vahtialueet`

**Goal:** List/table of areas (name, address label, radius, active declaration count, last checked, "Uusia: N" badge, notification switch, kebab), overview MapView, "Uusi vahtialue" button with limit tooltip, empty state, status strip from latest `job_runs`, `ReacceptanceBanner` slot. **Tests:** integration: other users' areas not listed; E2E `@smoke`. **Depends on:** MV-064, MV-060, MV-050

### MV-067 Watch-area detail `/vahtialueat/[id]` and `declarations.geojson` endpoint

**Goal:** Route `/vahtialueet/[id]`: map (60 vh mobile) + declaration list with filters (type, only-new, date range in searchParams), expandable rows with Finnish attribute labels and the intention disclaimer, actions (edit/notifications/delete with ConfirmDialog). `GET /api/watch-areas/[id]/declarations.geojson` owner-only, WGS84, includes `isNew` per alert state. **Tests:** integration endpoint 403 for non-owner; E2E filter + delete. **Depends on:** MV-066, MV-061, MV-037

### MV-068 Create/edit pages `/vahtialueet/uusi`, `/vahtialueet/[id]/muokkaa` and watch-area E2E suite

**Goal:** Single-page form reusing wizard steps; prefilled for edit. `tests/e2e/watch-areas.spec.ts` full journey on desktop + mobile; axe on all E05 pages; keyboard-only creation path (no map interaction). **Tests:** E2E edit radius → detail shows new radius; E2E full journey + axe + keyboard-only path. **Status:** absorbs MV-069 (merged 2026-09-20, ledger P11). **Depends on:** MV-065, MV-067
