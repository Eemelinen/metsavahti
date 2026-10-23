# E03 — Authentication (MV-040…MV-049)

### MV-040 Email transport and React Email base

**Goal:** Payload email adapter: nodemailer → Mailpit in dev/test, Resend in prod (env-switched); `src/emails/EmailLayout.tsx` (logo, footer with settings link + attribution); `renderEmail()` util. **Tests:** unit snapshot of layout; integration: `payload.sendEmail` reaches Mailpit (Mailpit API assertion). **Depends on:** MV-003, MV-031

### MV-041 Auth layout and shared form components

**Goal:** `(auth)` layout (centered card), `PasswordInput` with show/hide + zxcvbn strength meter, `FormError`, `FormSuccess`. **Tests:** unit component tests. **Depends on:** MV-005, MV-006

### MV-042 Registration

**Goal:** `/rekisteroidy` + Server Action `register`: Zod schema (email, password ≥ 10 chars & zxcvbn ≥ 3, confirm, `acceptTerms` required, `marketing` optional); creates user, writes `consent_events` (terms, privacy, marketing if ticked) with current legal versions; sends `VerifyEmail`; redirects to `/vahvista-sahkoposti?email=`; rate limit 5/h/IP. **Tests:** unit schema; integration: user + 2–3 consent rows + email; duplicate email returns neutral message; E2E `@smoke` register flow. **Depends on:** MV-040, MV-041, MV-035, MV-036

### MV-043 Email verification pages

**Goal:** `/vahvista-sahkoposti` (resend with 60 s cooldown), `/vahvista?token=` (success/expired/used states). Middleware sends unverified users to `/vahvista-sahkoposti`. **Tests:** integration token states; E2E: register → Mailpit link → verified → `/aloita`. **Depends on:** MV-042

### MV-044 Login / logout

**Goal:** `/kirjaudu` with remember-me (session length 30 d vs 1 d), `?next=` handling (same-origin only), errors: invalid, locked, unverified (+resend button). `/kirjaudu-ulos` POST action. **Tests:** integration: lockout after 5 failures; E2E `@smoke` login + logout. **Depends on:** MV-041, MV-031

### MV-045 Forgot / reset password

**Goal:** `/unohtunut-salasana`, `/uusi-salasana?token=`; `ResetPassword` email; neutral responses; reset invalidates other sessions. **Tests:** E2E via Mailpit; integration: old session rejected after reset. **Depends on:** MV-040, MV-044

### MV-046 Route protection middleware and session helpers

**Goal:** `src/middleware.ts`: guards for `(app)` routes, guest-only for auth routes, maintenance mode, security headers (CSP nonce, HSTS, frame-ancestors none). `getSessionUser()` (server), `requireUser()`, `assertOwner(user, doc)`, `AppError` mapping for Server Actions (`actionResult<T>()` wrapper returning `{ ok, data | error }`). Consolidated auth E2E suite. **Tests:** unit for wrapper; integration: matrix of route × auth state → expected status/redirect, `assertOwner` throws `Forbidden`; E2E: CSP has no violations on `/` and `/vahtialueet` (console check); consolidated `tests/e2e/auth.spec.ts` covering all E03 flows (register, verify, login/logout, reset, route protection) on Chromium + Mobile Chrome with axe on all auth pages. **Status:** absorbs MV-047 and MV-049 (merged 2026-09-20, ledger P11). **Depends on:** MV-044, MV-011, MV-010

### MV-048 Rate limiter

**Goal:** `src/lib/rate-limit.ts` Postgres-backed sliding window (`rate_limit_buckets` table, migration `0004`) with keys per IP/user/route; helper for Server Actions and Route Handlers; 429 → `/liikaa-pyyntoja` for form posts, JSON 429 for API. **Tests:** integration: 6th request within window rejected. **Depends on:** MV-030
