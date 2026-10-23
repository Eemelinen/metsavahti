# Metsävahti

**Metsävahti** (“forest watch”) is a small web service that keeps an eye on
Finnish _metsänkäyttöilmoitukset_ — the forest use declarations that must be
filed with Suomen metsäkeskus before felling — around places you care about
(your own forest plot, the summer cottage, a favourite hiking area). You draw a
circle on the map; Metsävahti checks the official open data twice a day and
emails you when a **new or changed declaration** lands inside that circle.

- **Data source:** Suomen metsäkeskus open data, WFS 2.0.0 layer
  `v1:forestusedeclaration` at `https://avoin.metsakeskus.fi/rajapinnat/v1/ows/`
  (CC BY 4.0, refreshed daily at 09:00 and 21:00, EPSG:3067).
- **Attribution:** the UI and every email carry the required line
  _“Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa MM/YYYY”_.
- **Language:** the product UI is Finnish; code, docs and commits are English.

## How it works

```
 user draws a watch area ──► watch-areas (PostGIS: buffered polygon in EPSG:3067)
                                                 │
 cron 09:30 / 21:30 ──► POST /api/jobs/run ──► sync-declarations workflow
                                                 ├─ fetch-declarations   WFS bbox query per area → declarations (+ geom, hashes, revisions)
                                                 ├─ match-watch-areas    ST_Intersects(declarations.geom, watch_areas.geom_3067) → watch-area-declarations (seen hashes) → alerts
                                                 └─ send-alerts          one email per (user, area) → notification-log
```

Change detection is geometry-based: `watch-area-declarations` stores the hashes last seen per
(watch area, declaration); a pair without a row produces a **new** alert, a pair whose `geom_hash`
differs from the stored one produces a **geometry_changed** alert. A second run with identical
upstream data sends nothing (idempotent). Alerts carry a `snapshot` of the declaration at alert
time; `notifiedAt` marks delivery and owners can only set `readAt`.

## Tech stack

| Layer             | Choice                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime / tooling | Node.js 22, pnpm 10, TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`)                                                                                                                                                                                                                                                     |
| App               | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4 with the design tokens from [docs/design/](docs/design/) as the theme, shadcn/ui, Figtree                                                                                                                                                                         |
| Backend / CMS     | Payload CMS 3 embedded in Next.js — collections `users`, `watch-areas`, `declarations`, `declaration-revisions`, `watch-area-declarations`, `alerts`, `notification-log`, `consent-events`, `data-export-requests`, `job-runs`, `legal-documents` (Lexical rich text), `exports` (upload); Payload Jobs Queue for the pipeline |
| Database          | PostgreSQL 16 + PostGIS 3.4 via `@payloadcms/db-postgres` (Drizzle); spatial SQL isolated in `src/lib/geo/spatial-queries.ts`                                                                                                                                                                                                  |
| Validation        | Zod 4 everywhere (WFS responses, env via `@t3-oss/env-nextjs`, forms via react-hook-form)                                                                                                                                                                                                                                      |
| Geo               | proj4 (EPSG:3067 ↔ 4326), @turf/turf, MapLibre GL + react-map-gl (OSM raster for now)                                                                                                                                                                                                                                          |
| Email             | Payload email adapters: nodemailer → Mailpit locally, Resend in production; templates with React Email                                                                                                                                                                                                                         |
| File storage      | `exports` upload collection: local disk (`EXPORTS_DIR`) in dev/test, S3-compatible bucket via `@payloadcms/storage-s3` when `S3_BUCKET` is set (D-013)                                                                                                                                                                         |
| Observability     | pino (pretty in dev), Sentry (enabled only when `SENTRY_DSN` is set)                                                                                                                                                                                                                                                           |
| Tests             | Vitest 5 (unit + integration with Testcontainers), Playwright 1.63 (E2E), msw, axe-core                                                                                                                                                                                                                                        |
| Quality           | ESLint 9 flat config, Prettier, Husky + lint-staged, commitlint, knip                                                                                                                                                                                                                                                          |

The full spec, including deviations from the original plan, is in
[docs/TECH_STACK.md](docs/TECH_STACK.md).

## Prerequisites

- Node.js 22 (`.nvmrc`) and pnpm 10 (`corepack enable` picks the pinned version)
- Docker Desktop (PostGIS ×2 + Mailpit run as containers; tests also start
  throwaway containers through Testcontainers)

## Quick start

```bash
pnpm install
cp .env.example .env            # then set PAYLOAD_SECRET and CRON_SECRET
pnpm db:up                      # PostGIS (dev + e2e) and Mailpit in Docker Desktop
pnpm db:migrate                 # applies src/payload/migrations to the dev DB
pnpm dev                        # http://localhost:3000
```

- `/` — landing page, `/rekisteroidy` — create an account (verification email → `/vahvista-sahkoposti`, resend with a 60 s cooldown), `/vahvista?token=` — the link from the email (verified / expired / used), `/kirjaudu` — sign in (remember-me, `?next=`), `/unohtunut-salasana` — request a reset link (neutral answer), `/uusi-salasana?token=` — set a new password (ends every session) → `/kirjaudu?reset=1`, `/kirjaudu-ulos` — log out (POST) → `/kirjauduttu-ulos`, `/dashboard` — your watch areas on a map
- `/admin` — Payload admin. The **first account created becomes admin**; use
  `/admin/create-first-user` or `pnpm db:seed` (creates `admin@metsavahti.local`).
- Mailpit UI: http://localhost:8025 — every email sent locally ends up here.
- Run the pipeline by hand: `pnpm jobs:run`, or
  `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/jobs/run`.

## Environments and databases

Development and tests never share a database, and tests never read `.env`:

|                   | Env file                                             | Database                                                                | App port                     |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| Development       | `.env` (git-ignored, from `.env.example`)            | compose `db` → `localhost:5432/metsavahti`, persisted volume            | 3000                         |
| Integration tests | `.env.test` + Testcontainers URL injected at runtime | throwaway `postgis/postgis:16-3.4` container per run (random port)      | —                            |
| E2E tests         | `.env.test` (committed, no real secrets)             | compose `db_test` → `localhost:5433/metsavahti_e2e`, tmpfs, `fsync=off` | 3100 (`.next-e2e` build dir) |

Safeguards:

- Every test command runs through `dotenv -e .env.test --`. Next.js and the
  Payload CLI never override variables that are already set, so `.env` values
  cannot leak in.
- `tests/helpers/db-guard.ts` aborts any test run whose `DATABASE_URL` is not a
  `*_test` / `*_e2e` database or points at port 5432.
- Payload runs with `push: false` everywhere; the schema comes only from the
  committed migrations, so dev, test and CI databases are identical.
- E2E uses its own Next build directory (`NEXT_DIST_DIR=.next-e2e`), so it can
  run while `pnpm dev` is up.

## Scripts

| Script                                                               | What it does                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`                                       | Next.js with Turbopack                                                                                  |
| `pnpm db:up` / `db:down`                                             | start / stop `db`, `db_test`, `mailpit`                                                                 |
| `pnpm db:migrate` / `db:migrate:create <name>` / `db:migrate:status` | Payload migrations (dev DB)                                                                             |
| `pnpm db:seed`                                                       | admin user, sample watch area and the four placeholder legal documents in the dev DB (refuses test DBs) |
| `pnpm db:reset`                                                      | drop volumes, recreate containers, migrate                                                              |
| `pnpm test`                                                          | unit + integration                                                                                      |
| `pnpm test:unit` / `test:watch`                                      | Vitest unit project (no DB, no network)                                                                 |
| `pnpm test:integration`                                              | Vitest integration project (Testcontainers PostGIS + Mailpit)                                           |
| `pnpm test:coverage`                                                 | both projects with v8 coverage (80 % line threshold on `src/lib/geo`, `src/lib/wfs`)                    |
| `pnpm test:e2e` / `test:e2e:ui`                                      | Playwright against `next dev -p 3100` + `db_test` + WFS mock                                            |
| `pnpm test:e2e:ci`                                                   | same, but builds first and runs `next start` (what CI does)                                             |
| `pnpm test:live`                                                     | opt-in contract test against the real Metsäkeskus WFS                                                   |
| `pnpm jobs:run`                                                      | run the sync workflow once against the dev DB                                                           |
| `pnpm fixtures:record -- --bbox …`                                   | record a fresh WFS sample into `tests/fixtures/wfs`                                                     |
| `pnpm lint` / `format` / `typecheck` / `knip`                        | quality gates (also run by Husky on commit and in CI)                                                   |
| `pnpm check` / `check:full`                                          | L1 verification (lint, typecheck, knip, format:check, unit); `check:full` adds integration + build      |
| `pnpm harness:check`                                                 | validate `feature_list.json` (WIP=1, evidence, layer labels)                                            |
| `pnpm harness:feature` / `harness:verify` / `harness:clean-state`    | feature state transitions, the verification gate, the clock-out gate                                    |
| `pnpm harness:loop` / `harness:report` / `harness:import-tickets`    | unattended feature loop, its run log, ticket → feature import                                           |

## Working with coding agents

The repository carries its own agent harness (course:
[learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)).
[AGENTS.md](AGENTS.md) is the operating manual (clock-in, verification layers, constraints,
definition of done, clock-out), [PROGRESS.md](PROGRESS.md) the session log,
[feature_list.json](feature_list.json) the feature tracker (one active feature, evidence before
`passing`) and `./init.sh` the standard startup path. Templates for handoffs, the clean-state
checklist, the evaluator rubric and the quality snapshot live in [docs/harness/](docs/harness/).
Claude Code users get permissions, hooks and the `/clock-in`, `/verify-feature` and
`/clock-out` skills from `.claude/` (see [CLAUDE.md](CLAUDE.md)).
`pnpm harness:loop` runs the loop unattended (one worktree, one session and one PR per
feature; see [docs/harness/README.md](docs/harness/README.md)). The product spec and its
tickets live in [docs/product/](docs/product/), the designs in [docs/design/](docs/design/);
[docs/README.md](docs/README.md) is the index of everything under `docs/`.

## Testing

See [tests/README.md](tests/README.md) for details. In short:

| Suite                       | Command                 | Needs                                                                  | Typical time                |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------- | --------------------------- |
| Unit (24 tests)             | `pnpm test:unit`        | nothing                                                                | ~2 s                        |
| Integration (12 tests)      | `pnpm test:integration` | Docker                                                                 | ~13 s incl. container start |
| E2E (29 checks, 3 browsers) | `pnpm test:e2e`         | Docker (`pnpm db:up`) + `pnpm exec playwright install chromium webkit` | ~25–35 s                    |
| Live contract               | `pnpm test:live`        | internet                                                               | ~5 s                        |

## Project structure

```
src/
  app/(frontend)/         root document + error boundaries; (auth)/ kirjaudu (+ login action), kirjauduttu-ulos, rekisteroidy (+ register action), vahvista-sahkoposti (+ resend action, button), vahvista, unohtunut-salasana (+ requestPasswordReset action, form), uusi-salasana (+ resetPassword action, form, invalid state); (marketing)/ landing, 404, /huolto, /liikaa-pyyntoja, /virhe (test hook); kirjaudu-ulos/route.ts (POST logout); (app)/dashboard
  app/(payload)/          generated Payload admin + REST/GraphQL routes
  app/api/health          liveness + PostGIS check
  app/api/jobs/run        cron entrypoint (Bearer CRON_SECRET)
  payload.config.ts       Payload config (postgres adapter, email, jobs)
  payload/collections     Users, WatchAreas, Declarations, DeclarationRevisions, WatchAreaDeclarations, Alerts, NotificationLog, ConsentEvents, DataExportRequests, JobRuns, LegalDocuments, Exports (upload)
  payload/access          access-control helpers
  payload/jobs            task + workflow definitions, cron access
  payload/schema          afterSchemaInit hook registering PostGIS columns
  payload/migrations      committed SQL migrations (PostGIS ext, generated column, GIST); README.md documents the raw-SQL pattern
  config/wfs.ts           WFS query constants (grid cell, bbox padding, max bbox side)
  lib/env.ts              validated environment (t3-env + Zod)
  lib/errors.ts           typed AppError subclasses, actionResult() for Server Actions, toErrorResponse()
  lib/geo                 crs.ts, buffer.ts, bbox.ts, hash.ts, spatial-queries.ts
  lib/legal/documents.ts  legal document slugs, latest-published resolver, placeholder seed
  lib/wfs                 client.ts, schemas.ts, parse.ts, hakkuutapa.ts
  lib/jobs                fetch-declarations, match-watch-areas, send-alerts
  emails                  React Email templates: EmailLayout (shared frame), AlertEmail, renderEmail()
  lib/notifications       provider.ts (which email adapter is active)
  lib/privacy             ip.ts (IP → network prefix before storage)
  components/             site header/footer/frame, brand mark, system pages, attribution, map (MapLibre), forms/ (PasswordInput, FormError, FormSuccess), shadcn ui/
  i18n/fi.ts              Finnish UI copy (new strings go here)
  lib/auth                password-strength.ts (zxcvbn score + E03 thresholds)
tests/
  unit/  integration/  e2e/  live/  helpers/  fixtures/wfs/
scripts/                  seed.ts, run-jobs.ts, record-fixtures.ts
docker-compose.yml        db (5432), db_test (5433), mailpit (1025/8025)
.github/workflows         ci.yml (lint → typecheck → unit → integration → build → e2e), nightly.yml (live WFS)
```

## Deployment notes

- Any host that runs Next.js 16 + a Postgres with PostGIS (Neon, Supabase,
  DigitalOcean Managed Postgres, or a droplet). Set the variables from
  `.env.example`; `RESEND_API_KEY` without `SMTP_HOST` selects Resend. `S3_BUCKET` (+ key, secret, optional
  `S3_ENDPOINT` for non-AWS providers) moves account-export archives from `EXPORTS_DIR` to object storage.
- Schedule `POST /api/jobs/run` with `Authorization: Bearer $CRON_SECRET` at
  09:30 and 21:30 Europe/Helsinki (≈30 min after Metsäkeskus updates).
- Migrations run automatically on boot in production (`prodMigrations`).

## Roadmap (not yet built)

The full plan is the ticket list in [docs/product/](docs/product/) (epics E00–E12, imported
into `feature_list.json`); routes will move to their Finnish names (`/kirjaudu`,
`/vahtialueet`, `/ilmoitukset`) as those tickets land — see
[docs/product/00-deviations.md](docs/product/00-deviations.md).

- Attribute-level change detection (currently geometry only) and hakkuutapa
  label verification against the Metsäkeskus code list.
- Geocoding (MML), rate limiting for public endpoints, MML background map.
- More component tests (`@testing-library/react`, started with the auth form components).

## Licence and data

Application code: MIT. Declaration data © Suomen metsäkeskus, CC BY 4.0 —
_Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa_.
