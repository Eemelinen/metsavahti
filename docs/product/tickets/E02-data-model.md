# E02 — Data Model & Migrations (MV-030…MV-037)

Owner of `payload.config.ts` collections and all migrations. Merge in order.

### MV-030 Enable PostGIS and migration scaffolding

**Goal:** Migration `0001_postgis` (`CREATE EXTENSION IF NOT EXISTS postgis`); Drizzle raw-SQL migration helper pattern documented in `src/payload/migrations/README.md`; `pnpm db:migrate`, `db:reset`. **Tests:** integration: `SELECT PostGIS_Version()` works. **Depends on:** MV-007

### MV-031 `users` collection

**Goal:** Fields per `01 §3.1`, `verify: true`, `forgotPassword`, `maxLoginAttempts 5`, `lockTime 10m`, `useSessions`, roles `user|admin`, access self-only. **Tests:** integration: user cannot read another user; admin can. **Depends on:** MV-030

### MV-032 `watch_areas` collection + geometry column

**Goal:** Fields per `01 §3.2`; `geom_3067` stays the generated column from migration `0001` (D-003, 00-deviations D1 — no trigger); add the GIST index if missing and rename `notifyByEmail` → `notificationsEnabled` in a migration (00-deviations D4). Validation: radius 100–5000, plan limit enforced in `beforeValidate` hook using `config/plans.ts`. **Tests:** integration: insert → geom not null, `ST_Area` ≈ πr² (±2 %); update radius → geom changes; 3rd area on free plan rejected. **Depends on:** MV-031

### MV-033 `declarations` + `declaration_revisions`

**Goal:** Per `01 §3.3`; migration `0003_declarations_geom` (`geom`, `centroid`, GIST, unique `source_id`, index on `valid_until`, `removed_at`). Admin read-only. **Tests:** integration: insert via raw helper; unique violation. **Depends on:** MV-030

### MV-034 `watch_area_declarations` and `alerts`

**Goal:** Per `01 §3.4–3.5`; unique (watch_area, declaration); alerts owner read + `readAt` update only; indexes on (user, createdAt desc), (user, notifiedAt). **Tests:** integration access control. **Depends on:** MV-032, MV-033

### MV-035 `notification_log`, `consent_events`, `data_export_requests`, `job_runs`, `exports` upload collection

**Goal:** Per `01 §3.6–3.9`; `exports` uses local disk in dev/test and S3-compatible storage in prod (adapter behind env). `consent_events` append-only (no update/delete access). **Tests:** integration: consent event cannot be updated. **Depends on:** MV-031

### MV-036 `legal_documents` collection + seed

**Goal:** Per `01 §3.10`; versioned; `publishedAt`; `requiresReacceptance`. Seed 4 placeholder docs (`privacy`, `terms`, `cookies`, `accessibility`) with version `2026-09-draft`. **Tests:** integration: latest published resolves. **Depends on:** MV-031, MV-012

### MV-037 Spatial query module

**Goal:** `src/lib/geo/spatial-queries.ts`: `upsertDeclarations(batch)`, `markMissing(bboxId, seenIds)`, `matchWatchAreas()` (the SQL in `01 §4.2`, returning inserted/changed rows), `declarationsForWatchArea(id)` → GeoJSON WGS84, `previewCount(center, radius)`. All Drizzle `sql` tags, parameterised. **Tests:** integration with factories: inside/outside/borderline fixtures → expected matches; distance for outside-but-intersecting polygon = 0; idempotent re-run inserts nothing. **Depends on:** MV-034, MV-025, MV-024
