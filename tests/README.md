# Tests

Three suites, each with its own isolation model. None of them can touch the
development database: every command runs through `dotenv -e .env.test --`, and
`helpers/db-guard.ts` aborts if `DATABASE_URL` is not a `*_test` / `*_e2e`
database or points at port 5432.

## Unit — `pnpm test:unit`

- Config: `vitest.unit.config.ts` (project `unit`, `environment: node`).
- Location: `tests/unit/**/*.test.{ts,tsx}`. Component/email tests opt into
  jsdom with `// @vitest-environment jsdom` at the top of the file and use
  `@testing-library/react` + `user-event` (`auth/auth-layout-and-shared-form-components.test.tsx`
  is the pattern: `render`, `screen`, `waitFor` for the lazily loaded scorer, `cleanup` in `afterEach`).
- No database, no network: `helpers/msw.ts` errors on any unhandled request.
- Covers CRS transforms (5 control points, round-trip < 1 mm) and GeoJSON reprojection, buffers/bboxes, WFS URL building + retry policy, Zod
  schema against the recorded fixture (snapshot), geometry hashing, hakkuutapa
  labels, attribution text, cron-secret comparison, email rendering (`EmailLayout` snapshot, alert
  template, adapter selection by env), the auth layout and form components (`PasswordInput`
  toggle + zxcvbn meter, `FormError`, `FormSuccess`, `scorePassword` thresholds), registration
  (`auth/registration.test.ts`: form schema per field, `validateRegistration` with the zxcvbn
  requirement and the email local part as a penalised input,
  the `register` action itself with `headers()` stubbed and `registerUser` spied: the sixth
  call from one address redirects to `/liikaa-pyyntoja` while another address passes, a duplicate address
  redirects exactly like a new account, a weak password is refused on the server; `clientIp`,
  the `VerifyEmail` template), the DB guard, the rate limiter (`infra/rate-limiter.test.ts`: the
  sliding window and its retry hint, `assert` / `reset`, name namespaces, `rateLimitKey`,
  `limitFormPost` → `/liikaa-pyyntoja`, `limitApiRequest` → JSON 429 with `Retry-After`; every unit
  test counts in `memoryRateLimitStore()`, set in `tests/unit/setup.ts`).
  email verification (`auth/email-verification-pages.test.ts`: the 24 h expiry boundary, the
  `resendVerification` action with `resendVerificationEmail` spied: one send per address per 60 s
  with the remaining seconds, neutral for unknown addresses, every call counted against the IP
  limit; `readSessionToken` against tokens signed with Payload's `jwtSign`, the cookie parser and
  `findUnverifiedSessionUser` with `findByID` stubbed; `email-verification-pages.resend-button.test.tsx`:
  the button's countdown under fake timers and how a short server refusal becomes the countdown),
  profile and security pages (`account/profile-security.test.ts`: `describeUserAgent` labels, the profile and
  password-change schemas with their Finnish messages, the time-zone options, `formatSessionTime`),
  forgot / reset password (`auth/forgot-reset-password.test.ts`: the two schemas, the `ResetPassword`
  template, the `requestPasswordReset` action with the helper spied: same answer for a registered and an
  unknown address, unusable address refused, the sixth call in an hour from one address redirects to
  `/liikaa-pyyntoja`; the `resetPassword` action: field errors, weak,
  `invalid`, redirect to `/kirjaudu?reset=1`), route protection (`auth/route-protection.test.ts`: the route
  table, the CSP directives and nonce, `handleRequest()` for public / user / guest-only / admin paths with a
  valid, forged and expired token and in maintenance mode, `pageDecision()`, `assertOwner()`, and the guards
  with a faked Payload: `actionResult()` maps a bare `requireUser()` to `unauthorized` and `assertOwner` to
  `forbidden`, pages are redirected to the login or the interstitial),
  cookie consent (`gdpr/cookie-consent-banner-and-modal.test.ts`: the `mv_consent` shape, parse fallbacks,
  the `Set-Cookie` attributes, the guest side of `POST /api/consent` with 415 / 400; `….ui.test.tsx`
  (jsdom): banner choices of equal size, "Mukauta" and the footer event open the modal, "Sulje" saves
  nothing, the analytics script only after consent, the error on a failed save),
  data export (`gdpr/data-export.test.ts`: `checkToken()` tells an expired link from a forged or foreign one,
  a pending / ready request past `expiresAt` counts as expired, `account.json` without credentials, the GeoJSON
  shape, the zip round trip, `ExportReady` with link, contents, size, expiry and attribution; `….ui.test.tsx`
  (jsdom): `ExportSection` posts JSON and shows "Valmistellaan…", the route's refusal, the ready link without a
  button, the next-allowed note and the failed state), account deletion (`gdpr/account-deletion.test.ts`: the
  form rule wants `POISTA` in upper case (spaces forgiven) and a password, both errors at once; `hashEmail()` is
  the SHA-256 of the trimmed, lower-cased address; `Poista tili` is the last account tab; `AccountDeleted` lists
  what was deleted and kept, the time and the attribution, has no settings link, words the area count),
  public forms (`gdpr/public-forms.test.ts`: both schemas trim and lower-case, name every field with the
  artboard copy, refuse an unknown request type; the honeypot rule; `TP-XXXXXXXX` references; the three emails
  (message escaped, receipt without the message, attribution); send order DPO → receipt with one reference and
  `Reply-To`, receipts capped at 3 a day per address, nothing sent for a filled honeypot; `….ui.test.tsx`
  (jsdom): browser validation, success state and "Lähetä toinen viesti", the honeypot out of the tab order and
  the accessibility tree, server field errors and the form-level alert),
  legal pages (`legal/legaldocument-renderer.test.tsx`: `splitLegalSections()` slugs, suffixes and reserved
  ids; `LegalDocument` markup: date in Finnish time, version, numbered sections whose ids match the TOC links,
  lists and links, extra sections first, no TOC without sections; the `config/cookies.ts` lifetimes),

## Integration — `pnpm test:integration`

- Config: `vitest.integration.config.ts` (project `integration`, one worker,
  `isolate: false` so a single Payload instance is reused across files).
- `global-setup.ts` starts a throwaway **PostGIS** and **Mailpit** through
  Testcontainers (Docker Desktop), runs `payload migrate` against the container
  and `provide()`s the endpoints; `setup.ts` `inject()`s them into `process.env`
  before the Payload config is imported.
- Each file calls `resetDatabase()` (TRUNCATE … CASCADE) in `beforeAll`.
- The WFS is stubbed with `msw` (`helpers/wfs-fixture.ts` answers bbox queries
  like the real service).
- Covers: PostGIS enabled (`PostGIS_Version()`, adapter `extensions`), applied migrations equal `index.ts`,
  migrations applied (generated `geom_3067`, GIST indexes), access
  control, the `users` collection (self-only read/update, admin-only `role`/`plan`/`deletedAt`,
  `01 §3.1` defaults, derived `marketingConsentAt`, IANA `timezone`, auth options),
  the `watch-areas` collection (generated `geom_3067` area ≈ πr², geometry follows a radius
  update, `01 §3.2` fields and the `notify_by_email` rename, radius bounds, free-plan limit of 2
  areas on create and on ownership change),
  the `declarations` + `declaration-revisions` collections (`01 §3.3` columns and indexes,
  generated `centroid` inside the MultiPolygon, raw insert via `helpers/declarations.ts`,
  unique `source_id` violation, derived `cuttingTypeLabel` / `validUntil`, admin read-only),
  the `watch-area-declarations` + `alerts` collections (`01 §3.4–3.5` columns, unique
  (watch_area, declaration), cascading FKs, `(user, created_at DESC)` / `(user, notified_at)` indexes,
  admin read-only join rows, owner-only alert read, `readAt`-only owner update, no owner create/delete,
  and a `down` → `up` round-trip of the MV-034 migration converting pre-MV-034 alerts),
  the `notification-log` + `consent-events` + `data-export-requests` + `job-runs` + `exports`
  collections (`01 §3.6–3.9` columns and indexes, consent events rejecting update/delete through
  access control and through the hooks even with `overrideAccess`, IP stored as a /24 prefix, owner-only
  reads, zip-only uploads written under `EXPORTS_DIR`, admin-only job runs and log, and a `down` → `up`
  round-trip of the MV-035 migration backfilling `type` / `provider` / `sent_at`),
  the `legal-documents` collection (`01 §3.10` columns, unique (slug, version), the idempotent
  placeholder seed, `findLatestLegalDocument()` ignoring drafts and future `publishedAt`, public read of
  published versions only, admin-only writes, and a `down` → `up` round-trip of the MV-036 migration),
  the email transport (`payload.email` is the nodemailer adapter; a layout-rendered
  `payload.sendEmail` reaches Mailpit with the settings link and attribution),
  registration (`registration.int.test.ts`: `registerUser()` creates an unverified user with
  `marketingConsent`, the `terms` / `privacy` / `marketing` consent rows at the seeded legal
  version with the IP reduced to /24, and the verify email in Mailpit whose link carries the
  user's `_verificationToken`; two rows without marketing; a duplicate address writes and sends nothing),
  email verification (`email-verification-pages.int.test.ts`: `verifyEmailToken` verifies once and
  then reports `invalid`, refuses a token past 24 h as `expired` without touching the account, treats
  unknown tokens as `invalid`; `resendVerificationEmail` issues a fresh dated token, the new link in
  Mailpit works and the old one does not, unknown/verified addresses send nothing; the session guard
  names a logged-in account whose `_verified` was reset while `payload.auth()` already returns no
  user; a `down` → `up` round-trip of the MV-043 migration),
  profile and security pages (`profile-security.int.test.ts`: `updateUserProfile` changes only the signed-in
  user's row and `users` access refuses another account; `user-sessions` is admin-only and one account's list
  never touches another's rows; `changeUserPassword` refuses a wrong current and a weak new password without a
  change, then ends every other session (their tokens fail `payload.auth()`) and keeps the asking one, the old
  password stops working; `verifyPassword` agrees with Payload's hashes; the sixth attempt in 15 min is
  `limited`; `recordSessionSeen` writes the browser once and `lastSeenAt` at most every 5 min;
  `listUserSessions` / `endOtherSessions` and the pruning of ended sessions; `currentSessionId`),
  forgot / reset password (`forgot-reset-password.int.test.ts`: `requestPasswordReset` writes a 40-hex
  token with a one-hour expiry and the Mailpit message carries the `/uusi-salasana?token=` link, an
  unknown address and a repeat within 60 s send nothing; `resetUserPassword` changes the password, the
  session from before the reset is refused by `payload.auth()`, the old password by `loginUser()`, the
  lockout is cleared, the token works once; expired, made-up and weak are refused without a change),
  route protection (`route-protection.int.test.ts`: the proxy's key equals `payload.secret`; route × auth
  state (guest, forged, revoked, unverified, verified) through `handleRequest()` and then the page's
  `pageDecision()` on the real session → 200 or which layer redirects where; `assertOwner` on a real watch
  area throws `Forbidden` for another user), rate limiter (`rate-limiter.int.test.ts`: the sixth request
  within the window is refused and the `rate_limit_buckets` row holds five hits, other addresses and
  routes have their own budget, two limiter instances share one count and twelve concurrent requests
  let exactly five through, the window slides, `limitApiRequest` answers 429, the sixth
  `requestPasswordReset` post redirects to `/liikaa-pyyntoja`, migration round-trip),
  the full `sync-declarations` pipeline (new → idempotent → changed
  geometry with a `declaration-revisions` row and an in-place `watch-area-declarations` update,
  emails asserted through the Mailpit API), the cron endpoint, and cookie consent
  (`cookie-consent-banner-and-modal.int.test.ts`: `POST /api/consent` sets the 12-month cookie for a guest
  without an event, appends a `cookies` event per save at the seeded cookie-policy version with the truncated IP
  for a session, treats a forged cookie as a guest, and answers 400 / 500 without a cookie), and the account
  export (`data-export.int.test.ts`: request → `export` job → a zip of exactly the five files, WGS 84 GeoJSON,
  no credentials in `account.json`, the `ExportReady` link from Mailpit downloads it, `notification-log` and
  `job-runs` rows; an expired token or request is 410, a forged, missing or foreign token 403; a second
  request the same day is refused, a failed export (SMTP down) keeps no file and can be retried, a failed log write
  after the send keeps the export ready, the route takes JSON only (415), a lapsed pending request allows a
  new one the next day; every test makes its own export), and account deletion
  (`account-deletion.int.test.ts`: an account with a row in every collection that refers to `users` (found
  from the live config) — a wrong password changes nothing; the right one stamps `deletedAt`, ends every
  session and refuses a login; the `delete-account` job leaves no row for the user anywhere except the consent
  events (user null, `emailHash`), deletes the notification-log rows sent to the address, sends
  `AccountDeleted` (Mailpit) logged without user or address, records its counters in `job-runs` and leaves a
  second account untouched; a run interrupted after the email finishes on retry without a second email; a
  user who did not ask is refused; 5 password attempts per 15 min; the route takes JSON only (415)), and the
  public forms (`public-forms.int.test.ts`: `submitContact` → `ContactReceived` to `CONTACT_EMAIL` with
  `Reply-To`, nothing to the visitor; `submitDataRequest` → the receipt to the requester and
  `DataRequestReceived` to `DPO_EMAIL` with the same reference (Mailpit); invalid input field by field and no
  email; a filled honeypot answers success and sends nothing; the sixth post of one form from one address
  redirects to `/liikaa-pyyntoja` while the other form keeps its budget).

## E2E — `pnpm test:e2e` (`test:e2e:ui` for the inspector)

- Config: `playwright.config.ts`. Requires `pnpm db:up` (compose `db_test` on
  5433 + Mailpit) and `pnpm exec playwright install chromium webkit`.
- Playwright starts two servers: the WFS mock (`e2e/mocks/wfs-server.ts`, Hono on 3200) and the app on **3100** (`next dev` locally, `next start` in CI, both with
  `NEXT_DIST_DIR=.next-e2e`). `reuseExistingServer` is on locally, so keep them
  running between iterations for fast reruns.
- The auth forms carry `data-hydrated` once react-hook-form has mounted (`useHydrated()`); `waitForForm()` in
  `e2e/accounts.ts` waits for it before filling, because RHF resets the inputs on mount and a value typed
  before hydration is lost (webkit under load).
- The cookie banner (MV-090) is on every page: `test` from `e2e/fixtures.ts` stores a "Vain välttämättömät"
  `mv_consent` cookie in each context (`addConsentChoice()` for contexts a spec opens itself), so the banner
  never covers a click; `cookie-consent-banner-and-modal.spec.ts` turns it off with
  `test.use({ consentChoice: false })` and intercepts `NEXT_PUBLIC_ANALYTICS_SCRIPT_URL` (a host that never resolves)
  to count analytics requests.
- Project order: `db-setup` (guard → migrate → truncate → seed first user, a
  watch area, one sent but unread alert (its declaration through SQL, `insertDeclaration()` in `helpers/db.ts`;
  the pipeline in `api.spec.ts` may add more) and the four placeholder legal documents, each with a lead and the `E2E_LEGAL_SECTIONS` of `fixtures.ts`, through the REST API) → `auth-setup` (logs in once, stores cookies
  in `e2e/.auth/user.json`) → `chromium`, `webkit`, `mobile-chrome` in parallel.
- Specs: public forms (`public-forms.spec.ts`: footer → `/yhteystiedot` with the addresses, the form switch
  and the attribution (axe); the browser errors (axe), then a sent message shows "Kiitos viestistäsi" and
  arrives at `CONTACT_EMAIL` with `Reply-To`; `/tietopyynto` through the switch, Tarkastus preselected, the
  self-service link, an invalid address, then Poisto → "Tietopyyntö vastaanotettu", the receipt and the DPO email
  with one reference), account deletion (`account-deletion.spec.ts`: a new account's `/tili/poista` shows the explanation
  and passes axe; the button stays disabled for `poista` or without a password, a wrong password shows the field
  error, the right one lands on `/tili-poistettu` (axe), the Mailpit email arrives, `/tili` then redirects to
  the login and the same credentials are refused), privacy page and data export (`data-export.spec.ts`: a new account's `/tili/tietosuoja` shows the
  terms and privacy consents, the policy and supervisory-authority links, opens the cookie modal, passes axe;
  "Lataa tietoni" → "Valmistellaan…" → the Mailpit link answers 200 with a zip, a forged token 403, and after a
  reload the ready state with its own download link), legal pages (`legaldocument-renderer-and-pages.spec.ts`: the four routes show the seeded document's
  date, version, lead and numbered sections, pass axe; at a desktop viewport the TOC links land on their
  sections, at a phone viewport the TOC is hidden; `/evasteet` lists the cookies from `config/cookies.ts` and
  "Avaa evästeasetukset" opens the consent modal; the footer reaches every page), app shell (`app-layout-sidebar-bottom-tabs.spec.ts`: sidebar on desktop, bottom tabs on Mobile Chrome,
  navigation between the three sections, the unread badge against the REST count, account menu, logout through
  `logOut()` in `e2e/accounts.ts`, which every logout test uses), profile and security pages
  (`profile-security.spec.ts`, guest, own account per test, `test.slow()`: `/tili` saves name and time zone and
  the header initials follow, axe; `/tili/turvallisuus` with a second Windows-Chrome context lists two sessions,
  refuses a wrong current password, changes it, the other context is sent to `/kirjaudu?next=`, the old
  password is refused and the new one works; "Kirjaa ulos muista laitteista" ends only the other session), landing page + attribution + axe, login and logout (`login-logout.spec.ts`, guest, an own
  verified account per test through `e2e/accounts.ts`: `@smoke` `/kirjaudu` → `/dashboard` (1-day cookie) →
  `Kirjaudu ulos` → `/kirjauduttu-ulos` → the session is gone server-side; remember-me gives a 30-day cookie and
  `?next=` follows same-origin paths only; invalid, unverified (+ inline resend → second Mailpit link) and locked
  after five wrong passwords; `/kirjaudu-ulos` is 405 on GET and a 303 for a guest; axe), forgot / reset password
  (`forgot-reset-password.spec.ts`, guest, own account and address per test: `@smoke` a second browser
  context logs in → `Unohditko salasanan?` → `/unohtunut-salasana` (inline validation, neutral status) →
  the Mailpit link → `/uusi-salasana` (length and match errors) → `/kirjaudu?reset=1` banner → the other
  context is sent to `/kirjaudu?next=%2Fdashboard` → old password `invalid`, new one reaches the dashboard →
  the link is `invalid` afterwards; an unknown address gets the same status and no email; made-up and
  missing tokens show the expired-or-used state; axe on every state), registration (`registration.spec.ts`,
  runs as a guest with its own `x-forwarded-for` per test: inline validation + meter + axe; `@smoke`
  register → `/vahvista-sahkoposti?email=` → verify email in Mailpit → the same address again
  gets the same redirect and no second email → login still refused while unverified; five
  weak-password submissions from one address, the sixth lands on `/liikaa-pyyntoja`), email verification
  (`email-verification-pages.spec.ts`, guest, own address per test: `@smoke` register → resend with the
  cooldown → the newest Mailpit link verifies and the older one is `invalid` → `Luo ensimmäinen
vahtialue` points at `/aloita` → login succeeds → the same link is `used`; an admin backdates
  `verificationSentAt` 25 h so the link is `expired` and its resend button issues a working one;
  `/vahvista` without or with an unknown token; an admin resets `_verified` on a logged-in account and
  `/dashboard` redirects to `/vahvista-sahkoposti?email=…&required=1` with the `VAHVISTUS` interstitial; axe on every state), the
  consolidated auth suite (`auth.spec.ts`, Chromium + Mobile Chrome only: `@smoke` register → verify → `/dashboard`
  via `/kirjaudu?next=` → the guest-only pages send the signed-in user on (a safe `?next=` too) → logout → reset →
  login; guests are sent from every app route with the full return address; an unverified session goes to the
  interstitial and may still open `/kirjaudu`; the security headers and a fresh nonce per request; no CSP violation
  on `/` and on the map page; axe on every auth page and state), dashboard
  redirect (`/kirjaudu?next=%2Fdashboard`)/map/pending-alert count, marketing layout + system pages (header/footer, 404 status,
  `/huolto`, `/liikaa-pyyntoja`, the error boundary through `/virhe`, axe), health and
  jobs API (runs the sync against the mock). `/virhe` throws only because `.env.test` sets
  `ENABLE_ERROR_TEST_ROUTE=1`; the unit test `infra/error-test-route.test.ts` checks that
  it is a 404 otherwise.

## Live contract — `pnpm test:live`

- `vitest.live.config.ts`; hits the real Metsäkeskus WFS. Runs nightly in CI
  (`.github/workflows/nightly.yml`) and tells you when the upstream data model
  drifts from `src/lib/wfs/schemas.ts`.

## Fixtures

`fixtures/wfs/forestusedeclaration.sample.json` is a real 2-feature sample
recorded with `pnpm fixtures:record` (coordinates rounded to cm). The E2E seed
and the integration tests derive the watch-area centre from its bbox.
