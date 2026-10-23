# E00 — Bootstrap & tooling (MV-001…MV-012)

Reconstructed 2026-09-06: the original E00 file was not delivered with the plan, but eight
tickets depend on MV-003 … MV-012. Titles are inferred from those references and from what
the scaffold (commit `cdc80a7`, CI green at `9bd9f80`) already contains; items marked
`**Status:** done` are `passing` in `feature_list.json` with that commit as evidence. If the
original file turns up, replace this one and re-run `pnpm harness:import-tickets`.

Id mapping: MV-001 is harness feature F-000 (bootstrap), MV-002 is F-001; the rest are
`F-<number>`. MV-005 (design tokens) is delivered by F-016.

### MV-001 Repository scaffold

**Goal:** Next.js + Payload 3 + PostGIS scaffold with pnpm, Prettier, ESLint, Husky, commitlint, knip, Vitest and Playwright wired (`pnpm check`, `check:full`). **Status:** done (F-000). **Depends on:** —

### MV-002 Strict TypeScript

**Goal:** `strict` + `noUncheckedIndexedAccess`, `@/*` paths, `tsconfig` shared by app, scripts and tests. **Status:** done (F-001). **Depends on:** MV-001

### MV-003 Environment validation and secrets layout

**Goal:** `src/lib/env.ts` (t3-env + Zod) as the only reader of `process.env`; `.env.example` lists every variable; `.env.test` is committed and points tests at the test database and the WFS mock. **Status:** done (scaffold). **Depends on:** MV-001

### MV-004 Docker services for dev and test

**Goal:** `docker-compose.yml` with `db` (5432), `db_test` (5433, tmpfs) and `mailpit` (1025/8025); `pnpm db:up/down`; Testcontainers for integration tests. **Status:** done (scaffold). **Depends on:** MV-001

### MV-005 Design tokens in the Tailwind theme

**Goal:** The design tokens (`docs/design/tokens.js`) are the Tailwind 4 theme in `src/app/globals.css`, Figtree is loaded with `next/font`, and lint enforces token-only styling. **Status:** delivered by F-016 (harness feature "Design system tokens and lint enforcement"). **Depends on:** MV-001

### MV-006 Shared UI primitives

**Goal:** shadcn `button`, `input`, `label`, `card` under `src/components/ui`, `cn` helper, `lucide-react` icons. **Status:** done (scaffold). **Depends on:** MV-005

### MV-007 Payload config and migration scaffolding

**Goal:** `payload.config.ts` with the Postgres adapter, `push: false`, `prodMigrations`, `afterSchemaInit` registration of PostGIS columns, `pnpm db:migrate*`, migration `0001` (PostGIS extension, generated `geom_3067`, GIST). **Status:** done (scaffold). **Depends on:** MV-003, MV-004

### MV-008 Logging and error reporting

**Goal:** pino logger (`src/lib/logger.ts`, pretty in dev) and Sentry enabled only when `SENTRY_DSN` is set. **Status:** done (scaffold). **Depends on:** MV-003

### MV-009 CI workflows

**Goal:** `ci.yml` (lint → typecheck → knip → format → unit → integration with coverage → build → e2e with PostGIS + Mailpit services) and `nightly.yml` (live WFS contract). **Status:** done (scaffold). **Depends on:** MV-001

### MV-010 Typed errors and action result wrapper

**Goal:** `src/lib/errors.ts` with `AppError` subclasses (`NotFound`, `Forbidden`, `RateLimited`, `ExternalServiceError`) and `actionResult<T>()` returning `{ ok, data | error }` for Server Actions; one mapping from error to HTTP response. **Tests:** unit for the wrapper and the mapping. **Depends on:** MV-002

### MV-011 Marketing layout and system pages

**Goal:** `(marketing)` layout with `SiteHeader` / `SiteFooter` (legal links, attribution, cookie-settings button), root `not-found.tsx` ("Sivua ei löytynyt"), `error.tsx` / `global-error.tsx` ("Jotain meni pieleen" + Sentry event id), `/huolto` and `/liikaa-pyyntoja` pages per `03-pages.md` → System routes, styled from the design tokens. **Tests:** E2E smoke for 404 and the layout; axe. **Depends on:** MV-005, MV-006

### MV-012 Seed script and admin bootstrap

**Goal:** `pnpm db:seed` creates the admin user and a sample watch area in the dev database and refuses test databases; first account created becomes admin. **Status:** done (scaffold). **Depends on:** MV-007
