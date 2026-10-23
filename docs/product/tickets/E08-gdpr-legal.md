# E08 — Consent, Legal Pages & GDPR Self-service (MV-090…MV-099)

### MV-090 Cookie consent banner and modal

**Goal:** `ConsentBanner` (equal-weight "Hyväksy kaikki"/"Vain välttämättömät", "Mukauta"), `ConsentModal` (categories necessary/analytics), `POST /api/consent` sets `mv_consent` cookie (12 m) and writes `consent_events` when logged in; footer "Evästeasetukset" reopens; analytics script loads only if granted. **Tests:** unit; integration cookie + event; E2E: banner shown once, choice persists, no analytics request without consent. **Depends on:** MV-011, MV-035

### MV-091 LegalDocument renderer and pages

**Goal:** `LegalDocument` (rich text → HTML, TOC on desktop, "Päivitetty" date, version); routes `/tietosuoja`, `/kayttoehdot`, `/evasteet` (+ cookie table from `config/cookies.ts`), `/saavutettavuus`. **Tests:** E2E render + TOC anchors + axe. **Depends on:** MV-036, MV-011

### MV-092 Legal content v1

**Goal:** Write the actual Finnish text for privacy policy (structure per `03b` §5, retention table auto-generated from `retention.ts`), terms, cookie policy, accessibility statement; seed as version `2026-09`. Include a clear note that it is a draft for legal review. **Acceptance:** each section listed in brief present; no placeholders left except controller identity fields from env (`LEGAL_CONTROLLER_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_ADDRESS`). **Depends on:** MV-091

### MV-093 Privacy page `/tili/tietosuoja` and data export

**Goal:** `/tili/tietosuoja`: consent history table from `consent_events`, cookie-settings button, export section (pending/ready/expired), links to policy + supervisory authority. `POST /api/account/export` → `data_export_requests` + `export` job building zip (`account.json`, `watch-areas.geojson`, `alerts.json`, `consents.json`, `notifications.json`), stored in `exports`, `ExportReady` email with signed link (24 h), download route `GET /api/account/export/[id]?token=`. Rate limit 1/day. **Tests:** integration: zip contains 5 files, geojson valid WGS84; expired token 410; E2E: page renders consent history; request → Mailpit link → 200. **Status:** absorbs MV-056 (merged 2026-09-20, ledger P11). **Depends on:** MV-050, MV-035, MV-070

### MV-094 Delete account page `/tili/poista` and account deletion

**Goal:** `/tili/poista`: explanation from `retention.ts`, `POISTA` + password confirmation form; `/tili-poistettu` public page. `POST /api/account/delete` (password re-check) → `delete-account` job per `01 §4.6`; `AccountDeleted` email sent first; consent events anonymised (user null, email sha256); session revoked; redirect `/tili-poistettu`. **Tests:** unit form validation; integration: no rows remain for user in any collection except anonymised consent events; login fails; E2E page renders, validates and deletes. **Status:** absorbs MV-057 (merged 2026-09-20, ledger P11). **Depends on:** MV-050, MV-070

### MV-095 Public data-request and contact forms `/tietopyynto`, `/yhteystiedot`

**Goal:** `/tietopyynto`: form (email, type, message, consent), rate-limited, emails `DPO_EMAIL` (`DataRequestReceived`) and confirmation to requester. `/yhteystiedot`: as spec; honeypot + rate limit; `ContactReceived` email. **Tests:** integration: both data-request emails, contact email; E2E both forms. **Status:** absorbs MV-096 (merged 2026-09-20, ledger P11). **Depends on:** MV-048, MV-040

### MV-097 Retention enforcement audit

**Goal:** Test that every retention rule stated in the privacy page (from `retention.ts`) has a corresponding cleanup implementation: unit test iterating `retention.ts` entries and asserting a handler exists in `cleanup` task registry. **Depends on:** MV-070, MV-092

### MV-098 Admin GDPR tooling

**Goal:** Payload admin: user detail shows consent history, export/delete triggers for admins (support requests), audit log entries in `job_runs`. **Tests:** integration admin-only. **Depends on:** MV-093, MV-094

### MV-099 Privacy review checklist doc

**Goal:** `docs/privacy-review.md`: data inventory table (collection → fields → purpose → legal basis → retention), processors list (hosting, email, tiles, geocoder, analytics), DPIA-lite answers. Generated partly from schema (script `pnpm privacy:inventory`). **Depends on:** MV-092
