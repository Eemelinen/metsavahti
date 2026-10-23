# E04 — Account & Settings (MV-050…MV-054)

### MV-050 App layout: sidebar / bottom tabs

**Goal:** `(app)` layout with desktop sidebar (Vahtialueet, Ilmoitukset, Tili) and mobile bottom tab bar; account menu; unread alert badge (count from `alerts.readAt IS NULL`). **Tests:** unit render at two viewports; E2E nav on Mobile Chrome. **Depends on:** MV-046, MV-034

### MV-051 Profile and security pages `/tili`, `/tili/turvallisuus`

**Goal:** `/tili`: name, locale, timezone edits (Server Action `updateProfile`); email shows current + "Vaihda" starting change flow (MV-052). `/tili/turvallisuus`: change password (current required; invalidates other sessions), sessions list (device/UA, created, last seen, current flag), "Kirjaa ulos muista laitteista". **Tests:** integration owner-only; integration: other session invalid after password change; E2E edit name + change password. **Status:** absorbs MV-053 (merged 2026-09-20, ledger P11). **Depends on:** MV-050, MV-046, MV-044

### MV-052 Email change flow

**Goal:** `pendingEmail` + signed token (`jose`, 1 h); `ChangeEmailConfirm` email to new address; notice to old; `/vaihda-sahkoposti/vahvista?token=` applies change and re-marks verified. **Tests:** integration: token reuse rejected; E2E via Mailpit. **Depends on:** MV-051, MV-040

### MV-054 Notification settings `/tili/ilmoitukset`

**Goal:** Global enabled toggle, mode radio (immediate/daily/weekly), per-watch-area override table (reads watch areas; if none, empty state), marketing consent toggle writing `consent_events`, "Lähetä testisähköposti" (rate-limited 3/h) sending a sample `AlertImmediate` with fixture data. **Tests:** integration: consent event written with `granted=false` on untick; E2E test email arrives in Mailpit. **Depends on:** MV-050, MV-035, MV-040
