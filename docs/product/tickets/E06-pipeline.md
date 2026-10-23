# E06 — Pipeline Jobs (MV-070…MV-079)

All tasks in `src/payload/jobs/`. Every ticket must keep the idempotency integration test green.

### MV-070 Jobs infrastructure and cleanup task

**Goal:** Configure Payload Jobs queue; `job_runs` writer helper (`withJobRun(task, fn)` recording status/stats/error); `POST /api/jobs/run` (Bearer `CRON_SECRET`, enqueues `pipeline`, returns runId); `pnpm jobs:run` script executing queue once; admin "Run pipeline now" button (admin only). `cleanup` task per `01 §4.4` using `retention.ts`, scheduled weekly via `POST /api/jobs/run?task=cleanup`. **Tests:** integration: unauthenticated 401; run creates `job_runs` row; cleanup removes expired declarations and keeps referenced ones. **Status:** absorbs MV-076 (merged 2026-09-20, ledger P11). **Depends on:** MV-035, MV-010, MV-033

### MV-071 fetch-declarations task

**Goal:** Per `01 §4.1`: load active areas → `clusterBboxes` → paged `WfsClient` fetch → normalise → `upsertDeclarations` (batches of 500, revisions on hash change) → per-bbox seen-set → `markMissing` (3 consecutive misses → `removedAt`). Per-bbox error isolation; status `partial`. Stats: requests, features, inserted, updated, removed. **Tests:** integration with MSW WFS fixtures: inserts; changed-geometry fixture → revision row; missing 3× → removed; one failing bbox → others succeed, status partial. **Depends on:** MV-070, MV-037, MV-023, MV-026

### MV-072 match-watch-areas task

**Goal:** Per `01 §4.2`: run `matchWatchAreas()`; create alerts `new` / `geometry_changed` / `attributes_changed` (+ `removed` behind `ALERT_ON_REMOVED`); update join hashes; update `lastCheckedAt`, `lastDeclarationCount`; snapshot in alert. **Tests:** integration: inside → 1 alert; borderline → 1; outside → 0; re-run → 0 new alerts; geometry change → `geometry_changed` alert once; area edited (radius grows) → new matches alerted next run. **Depends on:** MV-071, MV-034

### MV-073 Alert email templates and unsubscribe endpoint

**Goal:** `AlertImmediate` (one watch area, N alerts) and `AlertDigest` (grouped by area) React Email templates with Finnish copy, cutting-type explanation lines, distance formatting ("noin 350 m tontistasi"), CTA to `/ilmoitukset/[id]`, unsubscribe link (signed token, purpose `unsub`, watchAreaId, 30 d), settings link, attribution; optional static-map `<img>` when `ENABLE_MAP_IMAGES`. `GET /api/notifications/unsubscribe?token=` → sets `notificationsEnabled=false`, renders confirmation page with login link; token single-use recorded in `notification_log` or a small table. **Tests:** unit snapshots; assert required links present; HTML < 100 KB; integration: valid token → disabled; tampered → 400. **Status:** absorbs MV-055 (merged 2026-09-20, ledger P11). **Depends on:** MV-040, MV-024, MV-032, MV-046

### MV-074 send-notifications task

**Goal:** Per `01 §4.3`: group un-notified alerts per user; honour global prefs, per-area `notificationsEnabled`, digest schedule (run receives `{ scheduledDigest: 'daily'|'weekly'|null }` computed from Europe/Helsinki time); send; write `notification_log`; set `notifiedAt`; retry ≤5. **Tests:** integration: immediate → 1 email per area per run (Mailpit assert); daily mode → nothing on 21:30 run, one digest on 09:30 run; disabled area → none; failed provider (MSW 500) → alert stays un-notified, log `failed`. **Depends on:** MV-072, MV-073

### MV-075 Pipeline orchestration task and health status

**Goal:** `pipeline` runs fetch → match → notify sequentially with shared `runId`; skips notify if match failed; overall `job_runs` summary; guard against overlapping runs (advisory lock). Extend `/api/health` with last pipeline run (status, finishedAt, stats), `stale: true` if > 14 h old; `?deep=1` performs WFS GetCapabilities. **Tests:** integration end-to-end with fixtures: area + fake WFS → email in Mailpit; second run → no email; concurrent trigger → second returns 409; health reports the last run and `stale`. **Status:** absorbs MV-078 (merged 2026-09-20, ledger P11). **Depends on:** MV-071, MV-072, MV-074

### MV-077 Static map image endpoint (flagged)

**Goal:** `GET /api/alerts/[id]/map-image.png` (owner session or signed token): SVG composed from watch circle + polygon (3067 → local pixel space, no tiles) rendered with `@resvg/resvg-js`, cached 7 d. Behind `ENABLE_MAP_IMAGES`. **Tests:** integration: returns PNG, 403 for non-owner, token OK. **Depends on:** MV-034, MV-046

### MV-079 Pipeline load test script

**Goal:** `scripts/load/pipeline.ts`: seeds 1 000 watch areas across Finland, runs pipeline against WFS mock with generated features, asserts ≤ 200 requests and < 10 min; documented in `02-tech-stack.md`. Not in CI. **Depends on:** MV-075
