# Metsävahti — Tech Stack & Project Setup Spec

> **Status (2026-09-06):** implemented as the initial scaffolding. Deviations from the
> original spec, all forced by current package compatibility:
>
> | Spec                   | Implemented        | Reason                                                                                                                  |
> | ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
> | Next.js 15             | **Next.js 16.3**   | `@payloadcms/next@3.88` only supports Next 15.4.x or ≥16.2.6. Next 16 uses Turbopack by default and has no `next lint`. |
> | pnpm 9                 | **pnpm 10**        | Installed locally; `pnpm.onlyBuiltDependencies` replaces the old build-script prompt.                                   |
> | Zod (3)                | **Zod 4**          | Supported by `@t3-oss/env-nextjs` and `@hookform/resolvers`.                                                            |
> | Vitest (any)           | **Vitest 5**       | `projects` config, `clearMocks` on by default, no `poolOptions`.                                                        |
> | TypeScript 5           | TypeScript **5.9** | TypeScript 7 exists but `typescript-eslint` does not support it yet.                                                    |
> | Playwright             | **1.63**           | —                                                                                                                       |
> | `custom.scss` in admin | `custom.css`       | Avoids a Sass toolchain.                                                                                                |
>
> Planned by the product spec ([product/](./product/)) but not installed yet — add the row's
> reason here when the owning ticket lands:
>
> | Planned                                                   | Owning ticket                | Notes                                                                                        |
> | --------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
> | Postgres rate limiter (`rate_limit_buckets`)              | MV-048                       | No Upstash (00-deviations S4).                                                               |
> | Geocoder (MML) behind `Geocoder` interface                | MV-062                       | Needs `MML_API_KEY`; mock in tests.                                                          |
> | `MAP_TILE_URL` + MML taustakartta                         | MV-060, F-017                | OSM raster until the key exists.                                                             |
> | Resend bounce webhook                                     | MV-123                       | `POST /api/webhooks/resend`.                                                                 |
> | Consent-gated analytics (Plausible/Umami)                 | MV-126                       | Optional.                                                                                    |
> | `fast-xml-parser`, `jose`, `@resvg/resvg-js`, `@lhci/cli` | first ticket that needs each | 00-deviations S14; `zxcvbn` and `@testing-library/react` + `user-event` arrived with MV-041. |
>
> The original spec follows unchanged. Ongoing decisions live in [DECISIONS.md](./DECISIONS.md);
> the deviations between the product spec and this repository are listed in
> [product/00-deviations.md](./product/00-deviations.md).

Purpose: web service that watches Metsäkeskus metsänkäyttöilmoitukset (forest use declarations) around a user-defined area and notifies the user when a new or changed declaration appears nearby.

Data source: Suomen metsäkeskus open data, WFS 2.0.0 at `https://avoin.metsakeskus.fi/rajapinnat/v1/ows/` (CC BY 4.0, free, updated 2×/day at 09:00 and 21:00, CRS EPSG:3067). Attribution "Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa MM/YYYY" must be visible in the UI.

---

## 1. Core stack

| Layer                             | Choice                                                                                                                          | Notes                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                           | Node.js 22 LTS                                                                                                                  | Pin in `.nvmrc` and `engines`                                                                                                                                        |
| Package manager                   | pnpm 9                                                                                                                          | `packageManager` field in package.json, Corepack enabled                                                                                                             |
| Language                          | TypeScript 5, `strict: true`, `noUncheckedIndexedAccess: true`                                                                  |                                                                                                                                                                      |
| Framework                         | Next.js 15 (App Router, React 19, Server Actions, Route Handlers)                                                               |                                                                                                                                                                      |
| Backend / CMS                     | Payload CMS v3 (embedded in Next.js)                                                                                            | Collections: `users`, `watch-areas`, `declarations` (cached kuviot), `alerts`, `notification-log`. Built-in auth for users.                                          |
| Database                          | PostgreSQL 16 + PostGIS 3.4                                                                                                     | `@payloadcms/db-postgres` (Drizzle under the hood). Geometry columns handled outside Payload's field model — see §3.                                                 |
| ORM for spatial queries           | Drizzle ORM (already a Payload dependency) with raw `sql` tags for PostGIS                                                      | Keep spatial SQL in one module `src/lib/geo/spatial-queries.ts`                                                                                                      |
| Validation / schemas              | Zod                                                                                                                             | External data (WFS responses), form input, env vars                                                                                                                  |
| Env handling                      | `@t3-oss/env-nextjs` + Zod                                                                                                      | Fail fast on missing env                                                                                                                                             |
| Styling                           | Tailwind CSS 4 + shadcn/ui                                                                                                      | Theme = design tokens from `docs/design/tokens.js` (`src/app/globals.css`), Figtree via `next/font`; `eslint-plugin-better-tailwindcss` enforces token-only styling. |
| Forms                             | react-hook-form + zod resolver                                                                                                  |                                                                                                                                                                      |
| Maps                              | MapLibre GL JS + `react-map-gl`                                                                                                 | Background: OpenStreetMap raster for MVP, MML taustakartta later (needs API key). Overlay: Metsäkeskus WMS layer + own GeoJSON of matched kuviot.                    |
| Geo utilities                     | `proj4` (EPSG:3067 ↔ EPSG:4326), `@turf/turf` (buffer, booleanIntersects, distance, area), `wkx` (GeoJSON → WKB for `geomHash`) | Register EPSG:3067 definition once in `src/lib/geo/crs.ts`; content hashes in `src/lib/geo/hash.ts`                                                                  |
| HTTP client                       | native `fetch` + `p-retry`                                                                                                      | WFS calls: timeouts, retry with backoff                                                                                                                              |
| XML fallback                      | `fast-xml-parser`                                                                                                               | Only if WFS `outputFormat=application/json` is unavailable for a layer                                                                                               |
| Background jobs                   | Payload Jobs Queue (`payload.jobs`)                                                                                             | Tasks: `fetch-declarations`, `match-watch-areas`, `send-alerts`. Triggered by cron endpoint `POST /api/jobs/run` secured with `CRON_SECRET`.                         |
| Scheduling                        | Vercel Cron (or DigitalOcean cron on the droplet)                                                                               | Run 2×/day ~30 min after Metsäkeskus updates (09:30, 21:30 EET/EEST)                                                                                                 |
| Email                             | Resend + `@payloadcms/email-resend`, templates with React Email                                                                 | Local dev: Mailpit (SMTP capture) via nodemailer adapter                                                                                                             |
| Rich text (MV-036)                | `@payloadcms/richtext-lexical` as the single Payload editor (`legal_documents.body`)                                            | Stored as Lexical JSON in `jsonb`; MV-091 renders it with the package's React renderer                                                                               |
| File storage (MV-035)             | `@payloadcms/storage-s3` for the `exports` upload collection when `S3_BUCKET` is set                                            | Dev/test: local disk under `EXPORTS_DIR` (D-013)                                                                                                                     |
| Auth                              | Payload local auth (email + password), email verification enabled                                                               | Magic link / passkeys later                                                                                                                                          |
| Password strength (MV-041)        | `zxcvbn` 4 behind `src/lib/auth/password-strength.ts`                                                                           | Score ≥ 3 and ≥ 10 characters (E03); the client loads it lazily from `PasswordInput`                                                                                 |
| Logging                           | pino + pino-pretty (dev)                                                                                                        | Structured logs with job run ids                                                                                                                                     |
| Error tracking                    | Sentry (`@sentry/nextjs`)                                                                                                       |                                                                                                                                                                      |
| Rate limiting                     | `@upstash/ratelimit` or simple Postgres-based limiter                                                                           | Protect public geocoding/search endpoints                                                                                                                            |
| Geocoding (address → coordinates) | MML Geocoding API (free, API key) or Digitransit/Pelias                                                                         | Abstract behind `Geocoder` interface                                                                                                                                 |

## 2. Code quality tooling

- ESLint 9 flat config with `@next/eslint-plugin-next`, `typescript-eslint`, `eslint-plugin-playwright`, `eslint-plugin-vitest`
- Prettier + `prettier-plugin-tailwindcss`
- Husky + lint-staged (lint, format, `tsc --noEmit` on staged files)
- Commitlint (conventional commits); the `commit-msg` hook also rejects AI attribution footers and trailers
- `knip` for dead code / unused deps
- `syncpack` optional if it turns into a monorepo

## 3. Spatial data model (decision)

- `watch_areas`: Payload collection with `center` (Payload `point` field, WGS84), `radius_m` (number), `owner` (relation to users). A PostGIS generated column `geom_3067 geometry(Polygon, 3067)` = `ST_Buffer(ST_Transform(center, 3067), radius_m)` added via a Drizzle migration.
- `declarations`: Payload collection mirroring the WFS attributes (Metsäkeskus id, hakkuutapa code, pinta-ala, saapumispäivä, etc.) + `geom geometry(MultiPolygon, 3067)` + `geom_hash` (sha256 of WKB) + `first_seen`, `last_seen`.
- Matching = `ST_Intersects(declarations.geom, watch_areas.geom_3067)`, plus `ST_Distance` for "X m from your plot".
- Change detection = new Metsäkeskus id OR changed `geom_hash`/attributes → create `alerts` row → notification task.

## 4. Testing strategy

### 4.1 Unit tests — Vitest

- `vitest` + `@vitest/coverage-v8`, environment `node` by default, `jsdom` for component tests.
- `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- `msw` (Mock Service Worker) for mocking WFS / geocoder HTTP in unit tests.
- Targets: CRS transforms, buffer/intersect helpers, hakkuutapa code → label mapping, WFS response parsing (Zod schemas against recorded fixtures), change detection logic, email template rendering.
- Fixtures: `tests/fixtures/wfs/*.json` recorded from the real WFS (script `pnpm fixtures:record`). Snapshot tests on parsed output.

### 4.2 Feature / integration tests — Vitest + Testcontainers

- `@testcontainers/postgresql` using image `postgis/postgis:16-3.4` — real PostGIS per test file (or one shared container per run via `globalSetup`).
- Boot Payload with `getPayload({ config })` against the container DB; run migrations; use the Payload Local API to seed users/watch areas.
- `msw/node` server to stub WFS and Resend.
- Targets: full job pipeline (`fetch-declarations` → `match-watch-areas` → `send-alerts`) with a fake WFS returning kuviot inside/outside/borderline of a watch area; idempotency (second run sends nothing); geometry change triggers alert; Payload access control (user only sees own watch areas); Route Handlers via `next-test-api-route-handler` or direct handler invocation.
- Separate Vitest project: `vitest.config.ts` with `projects: ['vitest.unit.ts', 'vitest.integration.ts']`; integration tagged so `pnpm test:unit` stays fast.

### 4.3 End-to-end tests — Playwright

- `@playwright/test`, Chromium + WebKit + Mobile Chrome projects.
- `webServer` config starts `next dev`/`next start` against a dedicated `metsavahti_e2e` PostGIS DB (docker-compose service), migrated and seeded by a global setup script.
- Mailpit REST API (`http://localhost:8025/api/v1/messages`) to assert email delivery and extract verification/magic links.
- Metsäkeskus WFS stubbed at the network edge for E2E: point `WFS_BASE_URL` to a local mock server (`tests/e2e/mocks/wfs-server.ts`, tiny Hono/Express app serving fixtures) so E2E is deterministic and offline.
- Flows: sign-up → verify email → create watch area on map → trigger job via `/api/jobs/run` (API request in test) → see alert in dashboard → receive email. Also: accessibility check with `@axe-core/playwright` on main pages.
- Visual regression optional: Playwright `toHaveScreenshot` on the map view with a fixed style.

### 4.4 Contract / live smoke tests (opt-in)

- `pnpm test:live` runs a small Vitest suite against the real Metsäkeskus WFS (`GetCapabilities`, one `GetFeature` with BBOX) and validates the response against the Zod schema. Runs in CI nightly only (`if: github.event_name == 'schedule'`). Alerts you when Metsäkeskus changes the data model.

### 4.5 Load / misc

- `autocannon` script for the job endpoint and public pages (not in CI by default).
- `zod` schemas double as runtime contract; `typescript` `tsc --noEmit` in CI.

## 5. Local development

- `docker-compose.yml`: `db` (postgis/postgis:16-3.4, port 5432), `db_test` (same image, port 5433), `mailpit` (ports 1025/8025).
- `.env.example` with: `DATABASE_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `WFS_BASE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `SMTP_HOST/PORT` (dev), `MML_API_KEY`, `SENTRY_DSN`, `AUTH_RATE_LIMIT_PER_HOUR` (auth Server Actions per IP per hour, default 5, kept in `.env.test`; e2e tests set their own `x-forwarded-for`), `ENABLE_ERROR_TEST_ROUTE` (test hook: `1` enables the throwing `/virhe` route, set in `.env.test` only).
- Scripts:
  - `dev`, `build`, `start`
  - `db:up`, `db:migrate`, `db:seed`, `db:reset`
  - `test` (unit + integration), `test:unit`, `test:integration`, `test:e2e`, `test:e2e:ui`, `test:live`, `test:coverage`
  - `jobs:run` (runs the queue once locally)
  - `fixtures:record` (pulls fresh WFS samples for a given bbox into `tests/fixtures`)
  - `lint`, `format`, `typecheck`, `knip`

## 6. CI — GitHub Actions

- `ci.yml` on push/PR: install (pnpm cache) → lint → typecheck → unit → integration (Testcontainers needs Docker; use `ubuntu-latest`) → build → Playwright E2E (browsers cached, `postgis` + `mailpit` as service containers, upload traces/reports on failure).
- `nightly.yml` (schedule): live WFS contract test.
- Coverage thresholds: 80% lines for `src/lib/**` (geo + ingestion logic), report as PR comment.

## 7. Deployment

- Vercel (Next.js + Payload) + managed Postgres with PostGIS (Neon, Supabase, or DigitalOcean Managed Postgres — all support PostGIS) — or a single DigitalOcean droplet/App Platform if the job runtime limits on Vercel become a problem (WFS fetch for a whole municipality can take >60 s; prefer bbox-per-watch-area fetches to stay small).
- Vercel Cron → `POST /api/jobs/run` with `Authorization: Bearer $CRON_SECRET`.

## 8. Suggested repo structure

```
metsavahti/
  src/
    app/                 # Next.js routes (marketing, (auth), (app)/dashboard, api/)
    payload/             # payload.config.ts, collections/, jobs/, access/
    lib/
      geo/               # crs.ts, buffer.ts, spatial-queries.ts
      wfs/               # client.ts, schemas.ts, parse.ts
      notifications/     # email templates, senders
      jobs/              # task implementations
    components/
  tests/
    unit/
    integration/
    e2e/
      mocks/wfs-server.ts
    fixtures/wfs/
  docker-compose.yml
  vitest.config.ts  vitest.unit.ts  vitest.integration.ts
  playwright.config.ts
  .github/workflows/ci.yml  nightly.yml
```

## 9. Setup order for Claude Code

1. `pnpm create payload-app` (Next.js + Postgres template) → TypeScript strict, Tailwind, shadcn init.
2. Add docker-compose (PostGIS ×2, Mailpit), `.env.example`, t3-env.
3. Drizzle migration enabling `postgis` and adding geometry columns/indexes (GIST).
4. Implement `lib/geo` + `lib/wfs` with unit tests first (record fixtures from the real WFS once).
5. Payload collections + access control + Jobs tasks; integration tests with Testcontainers.
6. UI: watch-area creation on map, dashboard, alert list; email templates.
7. Playwright E2E with WFS mock server + Mailpit.
8. GitHub Actions CI + nightly live contract test.
9. Deploy; configure cron; add attribution line to footer.
