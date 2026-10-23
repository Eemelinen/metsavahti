# Decisions

Lightweight architecture decision records. Newest last. Add an entry whenever a choice
is made that a future session could not derive from the code alone (why, not what).
The original spec and its deviations table live in [TECH_STACK.md](./TECH_STACK.md).

Format: **Context** (what forced a choice) · **Decision** · **Consequences**.

## D-001 · Next.js 16 instead of the specified 15 (2026-09-06)

- Context: `@payloadcms/next@3.88` supports only Next 15.4.x or ≥16.2.6.
- Decision: Next 16.3 with Turbopack for dev and build.
- Consequences: no `next lint` (ESLint runs standalone); Next regenerates the agent-rules block in `AGENTS.md`; the `distDir` lock means parallel builds need separate `NEXT_DIST_DIR`s.

## D-002 · pnpm 10, Zod 4, Vitest 5, TypeScript 5.9 (2026-09-06)

- Context: versions available and mutually compatible at scaffold time (see the table in TECH_STACK.md).
- Decision: take the current majors; pin exact versions in `package.json`.
- Consequences: `pnpm.onlyBuiltDependencies` replaces the build-script prompt; Vitest `projects` config; Zod 4 APIs (`z.prettifyError`) are used in scripts.

## D-003 · Geometry columns live outside Payload's field model (2026-09-06)

- Context: Payload has no PostGIS field type.
- Decision: `watch_areas.geom_3067` is a generated column (`ST_Buffer(ST_Transform(center,3067), radius_m)`), `declarations.geom` is written by `lib/geo/spatial-queries.ts`; both are registered in `afterSchemaInit` so Drizzle knows them.
- Consequences: all spatial SQL is confined to one module; migrations that touch geometry are hand-written PostGIS statements.
- Update 2026-09-20 (F-033 / MV-033): `declarations.centroid` is a second generated column (`ST_Centroid(geom) STORED`, GIST-indexed) registered the same way, so `setDeclarationGeometry` keeps writing only `geom`.

## D-004 · Schema only from committed migrations (2026-09-06)

- Context: `push: true` would let dev and test schemas drift and could drop the PostGIS columns.
- Decision: `push: false` everywhere; `prodMigrations` apply on boot in production.
- Consequences: every schema change needs `pnpm db:migrate:create`; integration tests run `payload migrate` against the throwaway container.
- Update 2026-09-20 (F-030 / MV-030): the ticket's `0001_postgis` cannot exist as a separate first migration — Payload records every migration in `payload_migrations`, which the initial migration creates, so nothing can run before it. PostGIS is enabled by the adapter's `extensions: ['postgis']` before every `migrate` (CLI and boot) and by the first statement of `20260906_125038_initial`. Raw-SQL migration pattern: `src/payload/migrations/README.md`.

## D-005 · Three isolated database environments (2026-09-06)

- Context: an agent or a human running tests against the dev database would destroy data.
- Decision: dev `.env`/5432, integration Testcontainers, e2e `.env.test`/5433; every test script is wrapped in `dotenv -e .env.test --`; `tests/helpers/db-guard.ts` aborts on non-test databases or port 5432.
- Consequences: Docker Desktop is required for L2/L3; the Claude Code guard hook blocks bare `vitest`/`playwright` invocations.

## D-006 · Geometry-only change detection for the MVP (2026-09-06)

- Context: the WFS layer has no reliable "updated at" attribute.
- Decision: `geom_hash` (sha256 of WKB) decides `new` vs `changed`; a second run with identical data sends nothing.
- Consequences: attribute-only changes are missed until F-008 adds `attr_hash`.
- Update 2026-09-20 (F-025 / MV-025): `geom_hash` is now the sha256 of the _canonical_ WKB (`src/lib/geo/hash.ts`: coordinates rounded to 1 cm, rings rotated to their smallest vertex and wound consistently, holes and multipart members sorted), so re-serialised but unchanged boundaries no longer count as changed. `attrHash()` exists in the same module; its column and the `attributes_changed` rule arrive with MV-072 (00-deviations D5).
- Update 2026-09-20 (F-033 / MV-033): the `attr_hash` column exists and `fetch-declarations` computes it; an attribute-only change now updates the row and writes a `declaration_revisions` entry, but alerts still key on `geom_hash` until MV-072.
- Update 2026-09-20 (F-034 / MV-034): the compared hashes moved from the alert (`alerts.geom_hash`, dropped) to `watch_area_declarations.last_seen_geom_hash` / `last_seen_attr_hash` (`01 §3.4`); `kind: changed` became `changeType: geometry_changed`. An attribute-only change now updates `last_seen_attr_hash` silently, so MV-072 can switch `attributes_changed` on without a flood of stale alerts.

## D-007 · Agent harness layout (2026-09-06)

- Context: adopting the course _learn-harness-engineering_ (quick start + resource library) for Claude Code without fighting the existing toolchain.
- Decision:
  - The operating manual is `AGENTS.md` (agent-agnostic); `CLAUDE.md` imports it with `@AGENTS.md` and adds Claude-Code-only notes. The Next.js marker block stays in `AGENTS.md` but at the bottom.
  - State files: `feature_list.json` (course template schema, `status` / `user_visible_behavior` field names) and `PROGRESS.md` (vendor-neutral name; the course's `claude-progress.md` name is only a convention).
  - Verification is named, not rebuilt: L1 `pnpm check`, L2 `pnpm test:integration`, L3 `pnpm test:e2e`. The feature list is validated by `scripts/validate-feature-list.ts` from `pnpm test:unit`, lint-staged and the commit guard hook, not by a separate CI step.
  - Resource templates live in `docs/harness/`. No Makefile, no `templates/` directory, no blocking `Stop` hook (it fires after every reply and would nag during normal work); the contributed `audit-harness.sh` from the course greps for those names and will report them as recommended gaps.
  - Claude Code wiring in `.claude/`: shared `settings.json` (permissions + hooks), hooks `session-start.sh`, `guard.sh`, `format.sh`, skills `clock-in`, `clock-out`, `verify-feature`, subagent `evaluator`.
- Consequences: one manual for every agent; the loop (read state → one feature → verify → write state) is enforced by tooling rather than by prose; audit-script parity is a conscious non-goal.

## D-008 · Driver-run sessions: local loop, auto permissions, PR per feature, opt-in Stop hook (2026-09-06)

- Context: phase 2 of the harness (`docs/harness/phase-2-automated-loop.md`) makes sessions start unattended. D-007 rejected a Stop hook because it would nag during interactive work; an unattended session has nobody to nag and needs a hard stop condition.
- Decision:
  - The driver is a local script (`scripts/harness-loop.ts`, `pnpm harness:loop`) run on the developer's machine with the existing Claude Code login and host Docker; no CI or cloud runner.
  - Sessions run `claude -p --permission-mode auto --permission-prompts none` with an explicit `--allowedTools` list from `harness.config.json`. Allow rules resolve before the classifier, so the pnpm/git path is deterministic; the deny list and `guard.sh` still apply; `bypassPermissions` is not used because Docker and the dev database live on the host.
  - One git worktree and branch `feat/F-NNN` per feature, cut from `main`; the result is pushed and a PR is opened with `gh`. By default the driver waits for the merge before starting a dependent feature (`merge: "wait"`; `--auto-merge` arms `gh pr merge --auto --squash`).
  - Caps per session: 2 attempts per feature (one evaluator-driven retry), 200 turns, 15 USD, 60 minutes; the loop stops after 2 consecutive failed features. `manual:` verification steps are never waived unattended.
  - A generator/evaluator split: the evaluator runs as a separate `claude -p --agent evaluator` session on a different model with a JSON verdict schema.
  - The Stop hook `.claude/hooks/stop-guard.sh` is registered but inert unless `HARNESS_STOP_GUARD=1` (set by the driver); it blocks at most three times per session. This amends D-007.
- Consequences: `.harness/` (traces, run log, counters) is gitignored; `guard.sh` additionally blocks `pnpm db:up/down`, `git push`, `git checkout main` and worktree commands when `HARNESS_LOOP=1`; only one feature runs at a time because L3 uses fixed ports and `.next-e2e`; `gh` must be installed and logged in for PRs (without it the branch is pushed and the PR is opened by hand).

## D-009 · Design tokens are the whole Tailwind theme; the default palette is removed (2026-09-06)

- Context: the Claude Design tokens (`docs/design/tokens.js`) had to become enforceable, not advisory; agents otherwise reach for `bg-[#…]` and Tailwind's own palette.
- Decision:
  - `src/app/globals.css` declares the tokens in `@theme` and starts with `--color-*: initial`, so the default Tailwind palette does not exist; `text-gray-500` is an unknown class. shadcn's semantic names (`bg-primary`, `text-muted-foreground` …) are aliased onto the tokens so the generated `components/ui/*` keep working.
  - The radius scale is remapped, not copied: tokens.js `sm 6 / DEFAULT 10 / lg 14 / xl 20` becomes `rounded-sm 6 / rounded-md 8 / rounded-lg 10 / rounded-xl 14 / rounded-2xl 20`, because shadcn components already use `rounded-lg` for the default radius; `md: 8px` is added for compact buttons.
  - `src/lib/design-tokens.ts` mirrors the values for code that cannot use classes (MapLibre paint, React Email); `tests/unit/design/tokens.test.ts` fails when the two drift or when a colour literal appears elsewhere in `src/`.
  - Enforcement in L1: `eslint-plugin-better-tailwindcss` (`no-unknown-classes`, `no-conflicting-classes`, `no-duplicate-classes`, `no-restricted-classes` for arbitrary values and palette colours) and `react/forbid-dom-props` / `forbid-component-props` for `style`, with exceptions only for the map container and email templates.
  - No dark theme: the design has none, so the shadcn `.dark` block, the `dark` variant and `dark:` classes are removed (00-deviations R13).
- Consequences: new colours are added to both token sources in the same commit; a page ticket reads its artboard from `design-map.json` before coding; reintroducing dark mode needs a design first.

## D-010 · Unmatched URLs go through a catch-all route, not `app/not-found.tsx` (2026-09-06)

- Context: MV-011 asks for a root `not-found.tsx`. The app has two root layouts, `src/app/(frontend)/layout.tsx` and Payload's generated `(payload)/layout.tsx`, and no `app/layout.tsx`. Next builds its `/_not-found` route only from files directly under `app/`, and a custom `app/not-found.tsx` without `app/layout.tsx` makes `next dev` generate a root layout, which would wrap Payload's document in a second one. The alternative, `global-not-found.tsx`, is still behind `experimental.globalNotFound` in Next 16.3.
- Decision: `src/app/(frontend)/(marketing)/[...notFound]/page.tsx` catches every URL no other route matches and throws `notFound()`; `(marketing)/not-found.tsx` renders the 404 inside the marketing frame with the attribution footer. `notFound()` thrown at shell level goes through Next's error-recovery render, so the response carries status 404 and the 404 UI hydrates from the inlined payload rather than being in the HTML body.
- Consequences: Playwright and browsers see the designed page and a 404 status; `curl` sees the status and an empty body. `notFound()` inside `(app)` or later groups needs its own `not-found.tsx` (R7 in the deviations ledger) or falls back to Next's default. Revisit when `global-not-found.tsx` is stable: it would replace the catch-all with a server-rendered document (ledger R15).

## D-011 · The error boundary is tested through a flag-gated throwing route (2026-09-06)

- Context: `error.tsx` / `global-error.tsx` (MV-011) can only be seen when a route throws. The first F-011 attempt smoke-tested them with a temporary route that was deleted before the commit, so nothing reproducible covered the "Jotain meni pieleen" + Sentry event id clause. A component test would need `@testing-library/react`, which is not installed, and would still not prove that Next mounts the boundary inside the frame.
- Decision: `src/app/(frontend)/(marketing)/virhe/page.tsx` throws when `ENABLE_ERROR_TEST_ROUTE=1` (validated in `src/lib/env.ts`, set only in `.env.test`) and calls `notFound()` otherwise; it is `force-dynamic` so a production build never prerenders the throw. The e2e spec asserts status 500, the copy, the 32-hex event id, the attribution footer, axe and the retry button; a unit test asserts the 404 branch and the dynamic flag.
- Consequences: one deliberate route in `src/` exists for tests; outside tests it is indistinguishable from any unknown URL. `global-error.tsx` is not exercised (it only mounts when the root layout itself fails) but shares `ErrorState` and `SiteFrame` with `error.tsx`. Remove the route and the variable if a stable Next API for triggering boundaries appears.

## D-012 · WFS request boxes: 20 km grid, greedy merge, 100 km cap (2026-09-20)

- Context: the pipeline must serve 1 000 watch areas in ≤ 200 WFS requests (`01 §13`) and MV-026 asks for "a minimal set of merged bboxes each ≤ `wfs.maxBboxSizeM`" with a test of 1 000 random areas → ≤ 200 boxes. Finland's EPSG:3067 bounds cover roughly 710 × 1 200 km; uniformly random areas occupy ~800 distinct 20 km cells, so the "max e.g. 20×20 km" of `01 §2` cannot meet the target on its own. A 100 km box in southern Finland holds on the order of 10 000 active declarations, i.e. about ten pages of 1 000, which is acceptable for a twice-daily job.
- Decision: `src/config/wfs.ts` sets `clusterCellSizeM` 20 000, `bboxPaddingM` 500, `maxBboxSizeM` 100 000. `clusterBboxes` buckets padded area boxes by the grid cell of their centre, unions each cell (or keeps its members apart when the union would exceed the cap), then walks the seeds in grid order and merges each into the existing box whose union is smallest and still fits (greedy best-fit). The result is order-independent, every area is fully inside at least one box and every box has sides ≤ `maxBboxSizeM`; an area larger than the cap throws. Padding is a small edge margin, not the spec's "padded by max radius": the union of the actual area boxes is tighter than a cell padded by the largest possible radius.
- Consequences: 1 000 uniform random areas yield ~140 boxes (seeds 1, 2, 3, 42 in the unit test); clustered real users yield far fewer. The heuristic is not provably minimal; if request counts ever matter more, replace the merge step and keep the invariants (the test asserts them, not the exact boxes). MV-071 switches `fetch-declarations` from one request per area to one per cluster and owns the per-box seen-set; until then the constants are used only by `bbox.ts`.

## D-013 · Export archives: local disk by default, S3 adapter switched on by `S3_BUCKET` (2026-09-20)

- Context: `01 §4.5` stores account exports in a private Payload upload collection; ticket MV-035 asks for local disk in dev/test and S3-compatible storage in production "behind env". Payload's upload collections write to `staticDir` unless a storage plugin takes the collection over.
- Decision: `exports` is a normal upload collection (`staticDir` = `EXPORTS_DIR`, zip only, owner read). `@payloadcms/storage-s3` is always registered in `payload.config.ts` with `enabled: Boolean(S3_BUCKET)`, so the schema is identical in every environment and only the file store changes; `S3_ENDPOINT` switches to path-style addressing for non-AWS providers. Boot fails when the bucket is set without credentials.
- Consequences: no S3 SDK call happens in dev, test or CI; the integration test proves the local path (`test-results/exports`). Signed download links (`01 §4.5`) and expiry cleanup arrive with the export job (MV-09x); until then the file endpoint `/api/exports/file/<name>` is protected by the collection's owner-only `read` access.

## D-014 · Legal documents: one row per version, Lexical body, published = `publishedAt` ≤ now (2026-09-20)

- Context: `01 §3.10` leaves the shape open ("Payload globals or collection", "versioned", "rich text"). `consent_events.version` stores the string a user accepted, MV-086 compares it with the current version, and MV-091 renders "the latest published version".
- Decision: `legal_documents` is a collection with a unique (slug, version) index; a new version is a new row and an applied version is never edited. A row is published when `publishedAt` is set and not in the future; `findLatestLegalDocument()` in `src/lib/legal/documents.ts` is the only resolver. Anyone (including anonymous visitors) can read published rows, admins read every row, only admins write. `body` is a Lexical rich-text field; `@payloadcms/richtext-lexical` is registered once as the config-level `editor`. `pnpm db:seed` (and the tests) create the four placeholders at `2026-09-draft`, published, through the idempotent `seedLegalDocuments()`.
- Consequences: no Payload drafts/versions machinery (no `_versions` tables, no autosave); scheduling a version is setting a future `publishedAt`. The placeholders are visible on the legal pages until MV-092 seeds `2026-09`; that is deliberate so registration (MV-042) has a version to record from day one. MV-091 renders the JSON with `@payloadcms/richtext-lexical/react`.

## D-015 · Auth rate limiting starts in process memory behind the MV-048 interface (2026-09-20)

- Context: MV-042 requires "rate limit 5/h/IP" on registration, but the Postgres-backed limiter (`rate_limit_buckets`, MV-048) is a later ticket and F-042 does not depend on it. The deployment target is a single Node process (`docs/TECH_STACK.md`), so a per-process window already protects the mailbox and the database from a scripted signup loop.
- Decision: `src/lib/rate-limit.ts` exports `createRateLimiter({ limit, windowMs })` with `check(key)` / `assert(key)` (throws `RateLimited`, which `actionResult()` maps to `rate_limited`) over an in-memory sliding window, plus `authRateLimiter` fed by `AUTH_RATE_LIMIT_PER_HOUR` (default 5, which `.env.test` keeps so every layer observes the real refusal; each e2e test sends its own `x-forwarded-for` address, so the three browser projects and reruns against a reused dev server never share a bucket). The `register` action counts every call, before validation, keyed by `clientIp()` (`x-forwarded-for` first entry, then `x-real-ip`, else `unknown`).
- Consequences: the count resets on restart and is not shared between instances; a proxy that does not set `x-forwarded-for` collapses every client into one `unknown` bucket. MV-048 replaces the store and adds the `/liikaa-pyyntoja` redirect for form posts without touching callers; the ledger row is R16.

## D-016 · Email verification links expire after 24 h through `verificationSentAt`; the unverified-session guard lives in the `(app)` layout until MV-046 (2026-09-20)

- Context: MV-043 wants `/vahvista?token=` to distinguish success, expired and used, and "middleware" to send unverified users to `/vahvista-sahkoposti`. Payload's verification token never expires on its own and is nulled when used, so a used link and a made-up one look the same; the email and the page already promise "voimassa 24 tuntia". Payload's JWT strategy refuses an unverified account outright, so `payload.auth()` (and therefore every page and any `proxy.ts` that calls `/api/users/me`) sees such a session as a guest; the Local API cannot run inside `proxy.ts`.
- Decision: `users.verificationSentAt` (migration `20260920_180549`) dates the pending link: set by a `beforeChange` hook on an unverified create and by `resendVerificationEmail()`, which also issues a fresh token. `verifyEmailToken()` refuses a token older than `VERIFICATION_LINK_TTL_MS` (24 h) as `expired` without consuming it, so the page can resend to the same address; anything Payload no longer knows is `invalid` ("Linkki on jo käytetty"), whose only sensible action is the login. The unverified-session check is `findUnverifiedSessionUser()`: it verifies the `payload-token` cookie's HS256 signature with `payload.secret` (Node `crypto`, no new dependency), loads the user with `overrideAccess`, requires the session id to be listed on the user, and the `(app)` layout redirects to `/vahvista-sahkoposti?email=…&required=1`. The resend action counts every call against `authRateLimiter` and then allows one send per address per 60 s server-side (`resendCooldownLimiter`), so a reload cannot bypass the button's countdown.
- Consequences: accounts created before the column fall back to `createdAt`, which is when Payload issued their token. The guard runs when the `(app)` layout renders (every full request; not on client-side navigation between `(app)` pages, where the pages' own `payload.auth()` already refuses the session). MV-046 creates `src/proxy.ts` (Next 16's name for middleware, ledger R6) and moves the redirect there next to the login redirect; `readSessionToken()` is reusable from the proxy because it needs only the hashed secret.

## D-017 · Login sessions get their length from a per-request copy of the `users` auth config; logout is a POST-only route (2026-09-20)

- Context: MV-044 wants "Muista minut" to give a 30-day session and a plain login one day, `?next=` limited to this origin, the invalid / locked / unverified answers and a `/kirjaudu-ulos` POST. Payload's login operation takes the token lifetime only from `collectionConfig.auth.tokenExpiration` (7 d for the admin UI); its JWT strategy honours the token's `exp` and requires the session id to be listed on the user, but does not check the session's own `expiresAt`. Re-signing the token after `payload.login()` would leave the recorded session at 7 d and add a second read-modify-write of `users.sessions`, which is the array a concurrent login can already clobber.
- Decision: `loginUser()` in `src/lib/auth/login.ts` calls Payload's exported `loginOperation` with `createLocalReq` and a shallow copy of the `users` collection whose `auth.tokenExpiration` is 30 d or 1 d (`SESSION_TTL_SECONDS`), so the JWT `exp`, the session's `expiresAt` and the cookie's `Max-Age` agree in Payload's single write, the lockout (`maxLoginAttempts` 5, `lockTime` 10 min) counts exactly as through the REST endpoint, and the admin keeps 7 d. `LockedAuth`, `UnverifiedEmail` and `AuthenticationError` become `locked`, `unverified` and `invalid`; the verified flag is checked by Payload after the password, so "unverified" needs the right password. `safeNextPath()` accepts only absolute paths on this origin (no scheme, no `//`, no backslash or control characters, never `/kirjaudu`) and falls back to `/dashboard`. `/kirjaudu-ulos` is a Route Handler (POST only, 303 to `/kirjauduttu-ulos`) whose `endSession()` removes the cookie's session id from `users.sessions` without touching `updatedAt`, then expires the cookie; it works for an unverified session too, which `payload.auth()` cannot name. The `login` action has no per-IP limiter: a 5/h limit would fire on the same attempt as the lockout and hide the "locked" answer; per-route keys arrive with MV-048.
- Consequences: `loginOperation`'s argument shape is a Payload export and is pinned by the integration test (token and session expiry per remember-me, lockout, unverified, revoke). A logout only ends the session the cookie names; "revoke others" is `/tili/turvallisuus` (MV-04x). The cookie is set with `Max-Age`, so a plain login persists across browser restarts for a day. When Payload adds a per-login expiration option, replace the config copy and keep the outcome type; ledger R17.

## D-018 · Password reset goes through Payload's `forgotPassword` / `resetPassword` and then wipes `users.sessions` (2026-09-20)

- Context: MV-045 wants `/unohtunut-salasana` with a neutral answer, a `ResetPassword` email whose link works for an hour, `/uusi-salasana?token=` and "reset invalidates other sessions". Payload already implements the token (20 random bytes, `resetPasswordToken` + `resetPasswordExpiration`, `Users.auth.forgotPassword.expiration` = 1 h), the silent answer for unknown addresses (`forgotPassword` returns `null` and writes nothing) and the password change, but its `resetPassword` keeps every existing session, adds one of its own, leaves a login lockout in place and does not apply the registration strength rule.
- Decision: `requestPasswordReset()` calls `payload.forgotPassword()` and lets Payload send the template through `Users.auth.forgotPassword.generateEmailHTML` (HTML part only, like `verify`), so the REST endpoint and the admin UI send the same message; a per-address `resetCooldownLimiter` (1 per 60 s) is checked first and skips silently, and the action counts every call against the per-IP `authRateLimiter` (D-015). `resetUserPassword()` looks the account up by its unexpired token first (so the zxcvbn rule can penalise the address, and so `/uusi-salasana` can show the "expired or used" state before a password is typed), calls `payload.resetPassword()`, then `payload.update()`s `sessions: []`, `loginAttempts: 0`, `lockUntil: null` and drops the token. The page redirects to `/kirjaudu?reset=1` without setting a cookie: the artboard's "Tallenna ja kirjaudu" means "save, then log in" (`03-pages.md`: success → `/kirjaudu`), and a leaked link never becomes a session by itself. There is no per-IP limiter on the reset action: the token is 160 random bits.
- Consequences: after a reset every device is logged out, including the one that reset (it logs in with the new password on the next screen). The `resetPassword` Server Action and the page tell a used, an expired and a made-up token apart from nothing else: all three are `invalid`. Payload's own `/api/users/forgot-password` and `/api/users/reset-password` endpoints stay open with Payload's behaviour (no cooldown, sessions kept); MV-048's per-route keys or a disabled endpoint can close that later. Unverified accounts can reset their password too; the login still answers `unverified` afterwards.

## D-019 · Generator and evaluator both run on Claude Opus 5.5, pinned by model ID (2026-09-25)

- Context: driver-run sessions ran the generator on `fable` and the evaluator on the `opus` alias (D-008 wanted the evaluator on a different model). An alias follows whatever the installed Claude Code resolves it to, so the model a run used was not visible in the repository. Opus 5.5 defaults to `medium` effort, one level below its predecessor.
- Decision: `harness.config.json` pins `claude-opus-5-5` for `generator.model` and `evaluator.model`, and `.claude/agents/evaluator.md` pins the same ID for interactive use. Effort is set explicitly for both sessions (`generator.effort` and the new optional `evaluator.effort`, both `high`), and `scripts/harness-loop.ts` passes `--effort` to the evaluator as it already did for the generator. The driver's preflight sends one tiny `claude -p` request per configured model and stops before any worktree is created if it fails: a CLI too old for the model (Opus 5.5 needs Claude Code ≥ 2.1.280) answers every session with a 400, which would otherwise burn attempts and auto-block features. This amends D-008's "different model" point.
- Consequences: the evaluator now runs on the same model as the generator. Its independence comes from a fresh context, the rubric, the JSON verdict schema and read-only tools, not from model diversity, so correlated blind spots are more likely; the CI run on the PR is still the model-independent check. Moving to a newer model means changing the ID in these two files.
