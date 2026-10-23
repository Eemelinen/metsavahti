# E07 — Alerts Feed & In-app Notifications (MV-080…MV-086)

### MV-080 Alert feed `/ilmoitukset`, mark read and change-type semantics

**Goal:** Paginated (50, cursor) newest-first, grouped by date headers (Europe/Helsinki), `AlertItem` (area name, cutting chip, area ha, distance, change type label, "Näytä kartalla"), filter by watch area, unread styling, empty state. Server Actions `markAlertRead`, `markAllAlertsRead`; badge in nav updates. Labels/explanations for `new`, `geometry_changed`, `attributes_changed`, `removed` in `fi.ts`; icons; `removed` hidden unless flag. **Tests:** unit change-type labels; integration owner-only (feed and actions); E2E `@smoke` after pipeline run, badge count after mark read. **Status:** absorbs MV-081 and MV-084 (merged 2026-09-20, ledger P11). **Depends on:** MV-072, MV-050

### MV-082 Alert detail `/ilmoitukset/[id]` and full-loop E2E

**Goal:** Map zoomed to polygon (+ watch circle), snapshot attributes vs current (shows "Tiedot päivittyneet" if declaration changed since), link to Metsäkeskus map service (URL pattern in `config/wfs.ts`), "Mitä tämä tarkoittaa?" explainer per cutting type, marks read on view. `tests/e2e/alert-loop.spec.ts`: login → create area over fixture bbox → trigger `/api/jobs/run` via request context → feed shows alert → email in Mailpit contains link → link opens alert detail. Tag `@smoke`. **Tests:** E2E detail page; E2E full loop `@smoke`. **Status:** absorbs MV-085 (merged 2026-09-20, ledger P11). **Depends on:** MV-080, MV-060, MV-075

### MV-083 Dashboard "Uusia" badges, status strip and badge revalidation

**Goal:** Counts on `/vahtialueet` from unread alerts per area; status strip reads `job_runs` (last successful pipeline, stale warning). Nav badge revalidated via `revalidateTag('alerts:userId')` after pipeline run; no websockets in v1. **Tests:** integration counts; integration tag invalidation called. **Status:** absorbs MV-087 (merged 2026-09-20, ledger P11). **Depends on:** MV-066, MV-072, MV-074, MV-080

### MV-086 Reacceptance banner

**Goal:** `ReacceptanceBanner` compares user's latest `consent_events` versions to published `legal_documents`; soft banner with "Lue muutokset" + "Hyväksyn"; blocking modal if `requiresReacceptance`. **Tests:** integration: new version → banner data; accept writes event. **Depends on:** MV-036, MV-035, MV-066
