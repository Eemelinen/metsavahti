# 03 — Pages & Routes (implementation spec)

Conventions: App Router under `src/app`. Route groups: `(marketing)`, `(legal)`, `(auth)`, `(app)`. Layouts: `MarketingLayout` (header/footer), `AuthLayout` (centered card), `AppLayout` (sidebar / bottom tabs + footer). All copy from `src/i18n/fi.ts`. Every page: loading.tsx skeleton, error.tsx, metadata (title `… | Metsävahti`), and an E2E smoke test. Design intent and copy tone are in `03b-ui-design-brief.md`.

Legend — **Auth**: `public` | `guest-only` (redirect if logged in) | `user` (session + verified) | `unverified-ok`.

## Global components (`src/components`)

- `SiteHeader` (marketing + app variants), `SiteFooter` (legal links, attribution from `ATTRIBUTION` constant, cookie settings button)
- `ConsentBanner` + `ConsentModal` (categories, persists via `/api/consent`)
- `MapView` (MapLibre): props `center`, `radiusM?`, `watchAreaGeoJSON?`, `declarationsGeoJSON?`, `interactive`, `onCenterChange?`; layers: base tiles, Metsäkeskus WMS toggle, declarations fill by `cuttingType` colour token, watch circle, legend, "Keskitä" control, keyboard-accessible controls; `DeclarationPopover`
- `AddressSearch` (combobox → `/api/geocode`), `RadiusPicker` (segmented + slider), `CuttingTypeChip`, `AlertItem`, `WatchAreaCard`, `EmptyState`, `ConfirmDialog`, `Toast`, `LegalDocument` (renders rich text + TOC + updated date), `ReacceptanceBanner`

---

## (marketing)

| Route              | Auth   | Data                          | Components / notes                                                                                            | Tests                                                                |
| ------------------ | ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/`                | public | none (static)                 | Hero, 3-step strip, explainer box, trust section, FAQ accordion (content from `src/content/faq.ts`), CTA      | E2E: renders, CTA → `/rekisteroidy`, axe                             |
| `/miten-se-toimii` | public | static                        | Long-form explainer with 2 illustrations (SVG)                                                                | E2E smoke                                                            |
| `/hinnoittelu`     | public | `plans.ts`                    | Plan cards; feature-flag `SHOW_PRICING` hides nav link                                                        | E2E smoke                                                            |
| `/yhteystiedot`    | public | Server Action `submitContact` | Form (name, email, message, consent checkbox), Turnstile/honeypot, rate limit; sends email to `CONTACT_EMAIL` | Unit: schema; Integration: action sends email; E2E: submit → success |

## (legal)

| Route             | Auth   | Data                                | Notes                                                                                             | Tests                                    |
| ----------------- | ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `/tietosuoja`     | public | `legal_documents` slug `privacy`    | `LegalDocument`; retention table generated from `retention.ts`                                    | E2E: renders latest version, TOC anchors |
| `/kayttoehdot`    | public | slug `terms`                        | `LegalDocument`                                                                                   | E2E                                      |
| `/evasteet`       | public | slug `cookies` + `cookies.ts` table | Cookie table rendered from config; "Avaa evästeasetukset" button                                  | E2E: button opens modal                  |
| `/saavutettavuus` | public | slug `accessibility`                |                                                                                                   | E2E                                      |
| `/tietopyynto`    | public | Server Action `submitDataRequest`   | Form: email, type (access/erasure/other), message, consent; emails DPO; confirmation to requester | Integration + E2E                        |

## (auth)

| Route                         | Auth          | Data                     | Notes                                                                                                                                                                                  | Tests                                                                                 |
| ----------------------------- | ------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/rekisteroidy`               | guest-only    | Server Action `register` | Email, password (zxcvbn strength), confirm; required terms/privacy checkbox; optional marketing; writes consent events; sends verification; redirects to `/vahvista-sahkoposti?email=` | Unit: schema; Integration: creates user + consents + email; E2E full flow via Mailpit |
| `/vahvista-sahkoposti`        | unverified-ok | query `email`            | "Check your inbox", resend (cooldown 60 s, Server Action)                                                                                                                              | E2E                                                                                   |
| `/vahvista`                   | public        | `token`                  | Calls Payload verify; success → CTA `/aloita`; expired/used states                                                                                                                     | Integration: token paths; E2E                                                         |
| `/kirjaudu`                   | guest-only    | Server Action `login`    | Email, password, remember, forgot link; errors: invalid, locked, unverified (+resend); honours `?next=`                                                                                | Integration: lockout after 5; E2E                                                     |
| `/unohtunut-salasana`         | guest-only    | Server Action            | Neutral response always                                                                                                                                                                | E2E via Mailpit                                                                       |
| `/uusi-salasana`              | public        | `token`                  | New password + confirm → success → `/kirjaudu`                                                                                                                                         | E2E                                                                                   |
| `/kirjaudu-ulos`              | user          | Server Action `logout`   | POST only; then redirect `/` with toast                                                                                                                                                | E2E                                                                                   |
| `/vaihda-sahkoposti/vahvista` | public        | `token`                  | Applies pending email change                                                                                                                                                           | Integration                                                                           |

## (app)

| Route                       | Auth         | Data                                                                  | Notes                                                                                                                                                                                                                                           | Tests                                                                                                 |
| --------------------------- | ------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/aloita`                   | user         | plan limits                                                           | 3-step wizard (location → radius → name/notify). Step 2 calls `/api/watch-areas/preview` (debounced). Save via Server Action `createWatchArea` → redirect `/vahtialueet/[id]?created=1`. Skippable → `/vahtialueet`                             | Unit: wizard state reducer; E2E: create first area                                                    |
| `/vahtialueet`              | user         | owner's watch areas + counts; last pipeline run                       | List/table, overview `MapView` (all areas), "Uusi vahtialue" (disabled at limit with tooltip), notification toggle (Server Action `toggleWatchAreaNotifications`), kebab: edit/delete; status strip "Tiedot päivitetty …"; `ReacceptanceBanner` | Integration: access control (other user's areas invisible); E2E                                       |
| `/vahtialueet/uusi`         | user         |                                                                       | Same form as wizard on one page                                                                                                                                                                                                                 | E2E                                                                                                   |
| `/vahtialueet/[id]`         | user (owner) | area + `/api/watch-areas/[id]/declarations.geojson` + alerts for area | Map ~60 vh on mobile; declaration list with filters (type, only new, date range via searchParams); expand row → attributes in Finnish + disclaimer; actions edit / notifications / delete (`ConfirmDialog`)                                     | Integration: geojson endpoint owner-only; E2E: list + filter + delete                                 |
| `/vahtialueet/[id]/muokkaa` | user (owner) | area                                                                  | Edit form; Server Action `updateWatchArea` (re-buffer via trigger; re-match on next run; set `lastCheckedAt = null`)                                                                                                                            | Integration: update changes geom; E2E                                                                 |
| `/ilmoitukset`              | user         | alerts (paginated 50, newest first), grouped by date                  | `AlertItem`; "Merkitse kaikki luetuiksi" (Server Action); filter by watch area; empty state                                                                                                                                                     | Integration: markAllRead owner-only; E2E                                                              |
| `/ilmoitukset/[id]`         | user (owner) | alert + declaration + watch area                                      | Map zoomed to polygon; snapshot attributes; link to Metsäkeskus map service; explainer; marks read on view                                                                                                                                      | E2E                                                                                                   |
| `/tili`                     | user         | user                                                                  | Profile form: email (starts change flow), name, locale, timezone; Server Action `updateProfile`                                                                                                                                                 | Integration; E2E                                                                                      |
| `/tili/turvallisuus`        | user         | sessions                                                              | Change password (current + new), sessions list, "Kirjaa ulos muista laitteista"                                                                                                                                                                 | Integration: password change invalidates other sessions; E2E                                          |
| `/tili/ilmoitukset`         | user         | prefs + areas                                                         | Global enabled, mode (immediate/daily/weekly), per-area override table, marketing consent toggle (writes consent event), "Lähetä testisähköposti"                                                                                               | Integration: consent event written; E2E via Mailpit                                                   |
| `/tili/tietosuoja`          | user         | consent_events, export requests                                       | Export button → `POST /api/account/export` → pending state; consent history table; cookie settings; links                                                                                                                                       | Integration: export job produces zip with 5 files; E2E: request → email link (Mailpit) → download 200 |
| `/tili/poista`              | user         |                                                                       | Explanation; type `POISTA` + password; `POST /api/account/delete`; final "Tilisi on poistettu" page (public route `/tili-poistettu`)                                                                                                            | Integration: all owned rows gone, consent events anonymised; E2E                                      |

## System routes

| Route                            | Notes                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `not-found.tsx` (root)           | "Sivua ei löytynyt"                                                                                     |
| `error.tsx` / `global-error.tsx` | "Jotain meni pieleen" + Sentry event id                                                                 |
| `/huolto`                        | Maintenance page; middleware redirects everything here when `MAINTENANCE_MODE=1` (except `/api/health`) |
| `/liikaa-pyyntoja`               | Shown by rate limiter for form routes (429)                                                             |
| `/tili-poistettu`                | Public confirmation                                                                                     |
| `/admin`                         | Payload admin (admins only), `noindex`                                                                  |
| `/api/*`                         | See technical description §6                                                                            |
| `robots.txt`, `sitemap.xml`      | Marketing + legal only                                                                                  |

## Emails (`src/emails/`, React Email)

`VerifyEmail`, `ResetPassword`, `ChangeEmailConfirm`, `AlertImmediate`, `AlertDigest`, `ExportReady`, `AccountDeleted`, `ContactReceived` (internal), `DataRequestReceived` (internal). Shared `EmailLayout` with attribution and settings/unsubscribe links. Each has a unit test rendering to HTML with a snapshot and asserting required links.

## i18n

`src/i18n/fi.ts` is the only source of UI strings (typed keys). `en.ts` may exist as a stub returning Finnish; the locale switch is wired but English translation is out of scope for v1 tickets.
