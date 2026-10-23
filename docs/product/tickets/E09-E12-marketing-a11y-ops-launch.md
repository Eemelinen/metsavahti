# E09 — Marketing Site (MV-100…MV-101)

### MV-100 Landing page `/`, FAQ content and SEO

Hero, 3-step strip, explainer box, trust section, FAQ (from `src/content/faq.ts`: 8 Finnish Q&As — what is a declaration, exemptions, why alert may be late, is my data shared, cost, accuracy of radius, cancel account, source licence), CTAs; illustrative map mock as static SVG/PNG. SEO & metadata: Open Graph images (static), `sitemap.xml`, `robots.txt`, canonical, `fi` lang, structured data (Organization, FAQPage). **Tests:** unit for sitemap entries; E2E `@smoke` + axe + Lighthouse budget (perf ≥ 90 in CI via `@lhci/cli`, non-blocking). **Status:** absorbs MV-103 and MV-104 (merged 2026-09-20, ledger P11). **Depends on:** MV-011

### MV-101 `/miten-se-toimii`, `/hinnoittelu` and marketing E2E + visual snapshots

`/miten-se-toimii`: long-form page with two SVG illustrations (2×/day cycle; sample email). `/hinnoittelu` behind `SHOW_PRICING`: plan cards from `plans.ts`. `tests/e2e/marketing.spec.ts` with `@visual` snapshots desktop/mobile for every marketing page. **Tests:** E2E + `@visual` snapshots. **Status:** absorbs MV-102 and MV-105 (merged 2026-09-20, ledger P11). **Depends on:** MV-011, MV-100

---

# E10 — Accessibility & i18n Hardening (MV-110…MV-113)

### MV-110 Axe sweep, reduced motion and colour-blind check

Run `@axe-core/playwright` on every route listed in `03-pages.md` (logged-in and out); fix all serious/critical; keep list in `tests/e2e/a11y.spec.ts`. Respect `prefers-reduced-motion`; cutting-type colours verified with simulated deuteranopia and always paired with icons/labels. **Status:** absorbs MV-114 (merged 2026-09-20, ledger P11). **Depends on:** E05, E07, E08, E09

### MV-111 Keyboard and screen-reader pass for map flows

Non-map fallback for area creation (address + radius fields only), focus management in wizard/dialogs, live regions for preview count and toasts. **Depends on:** MV-065, MV-067

### MV-112 Finnish copy review

Consistency pass on `fi.ts` (terminology: vahtialue, ilmoitus, metsänkäyttöilmoitus, hakkuutapa), date/number formatting via `Intl`, error messages human-readable. **Depends on:** all UI epics

### MV-113 English locale stub wiring

Locale switch in `/tili` persists; `en.ts` falls back to Finnish; `<html lang>` follows locale. **Depends on:** MV-051

---

# E11 — Ops: Deployment, Cron, Observability (MV-120…MV-127)

### MV-120 Production DB provisioning doc + migration in CI

Managed PostGIS (Neon/Supabase/DO) decision recorded; migrations run on boot via `prodMigrations` (D-004, 00-deviations S12) with `pnpm db:migrate` documented for hosts that need an explicit deploy step; backup schedule documented. **Depends on:** E02

### MV-121 Vercel project + preview environments

Vercel config, env matrix (preview vs prod), preview DB branching, `NEXT_PUBLIC_SERVER_URL` per env. **Depends on:** MV-120

### MV-122 Cron scheduling

`vercel.json` crons 09:30 & 21:30 Europe/Helsinki (convert to UTC with DST note) hitting `/api/jobs/run` with `CRON_SECRET`; weekly cleanup; fallback instructions for external cron (cron-job.org / DO) if Vercel limits bite. **Tests:** integration: secret required. **Depends on:** MV-075, MV-121

### MV-123 Resend production email

Domain verification, DKIM/SPF/DMARC records doc, sandbox for preview, bounce/complaint webhook `POST /api/webhooks/resend` disabling notifications on hard bounce (logged). **Tests:** integration webhook signature check. **Depends on:** MV-040, MV-121

### MV-124 Sentry

Server, edge, client, jobs; release tagging; PII scrubbing (emails hashed, coordinates rounded to 1 km in breadcrumbs). **Depends on:** MV-010

### MV-125 Uptime + pipeline alerting

External monitor on `/api/health`; alert if `stale: true`; Slack/email notification; `nightly.yml` live contract test failure notifies. **Depends on:** MV-075, MV-029

### MV-126 Analytics (optional, consent-gated)

Plausible/Umami self-hosted or cloud, loaded only after analytics consent; no cookies without consent; documented in cookie policy. **Depends on:** MV-090

### MV-127 Runbook

`docs/runbook.md`: deploy, rollback, rerun pipeline, inspect job_runs, rotate secrets, handle WFS schema change (update `layer.ts`, refresh fixtures, bump `sourceLayerVersion`), handle bounce, restore backup. **Depends on:** MV-122…MV-125

---

# E12 — Hardening & Launch (MV-130…MV-135)

### MV-130 Security review pass

CSP tightened to actual domains, dependency audit, Payload admin locked to admin role + IP allowlist optional, secrets rotation test, OWASP quick checklist recorded. **Depends on:** all

### MV-131 Load & performance

Run MV-079 pipeline load test against staging; k6/autocannon on `/vahtialueet` and preview endpoint; fix N+1s; add indexes if needed (migration). **Depends on:** MV-079, MV-121

### MV-132 Full E2E + nightly green for 3 consecutive nights

Stabilise flaky tests; visual baselines locked. **Depends on:** E10

### MV-133 Legal review handoff

Export legal docs for review; incorporate feedback as new `legal_documents` version with `requiresReacceptance` decision. **Depends on:** MV-092

### MV-134 Beta with real watch areas

Create 3 real watch areas (incl. owner's plot), run real pipeline for 1 week, verify a real alert email arrives, fix issues. **Depends on:** MV-122, MV-123

### MV-135 Launch checklist

Checklist doc signed off: DNS, HTTPS, cron verified twice, monitoring alerts tested, backups tested, legal pages published, consent works, export/delete tested in prod, attribution visible, admin accounts hardened, support email works. **Depends on:** MV-130…MV-134
