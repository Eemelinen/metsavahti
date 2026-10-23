# Metsävahti — UI Description for Claude Design

## Product summary

Metsävahti is a Finnish web service that watches official forest-use declarations (metsänkäyttöilmoitukset, from Suomen metsäkeskus open data) around a user's plot and notifies them by email when someone plans to cut forest nearby. Users create one or more **watch areas** (a point + radius, or later their own property boundary), and the service checks twice a day for new or changed declarations that intersect those areas.

Audience: private landowners, summer-cottage owners, nature-minded people. Not forestry professionals. Tone: calm, trustworthy, clear — think "public service" rather than "startup". UI language: Finnish primary (all copy in Finnish), with an English toggle planned later; design should accommodate long Finnish words.

Design direction: light, nature-informed palette (deep forest green primary, warm off-white background, amber/orange for alerts, muted grey-green for secondary), generous whitespace, one clean sans-serif. Mobile-first: most alert emails will be opened on a phone, and the dashboard must work one-handed. Maps are central — treat them as first-class content, not a widget.

Attribution line required in the footer of every page and in emails: "Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa MM/YYYY" plus an OpenStreetMap/MML map attribution.

---

## Global elements

- **Header (public):** logo/wordmark "Metsävahti", nav: Miten se toimii, Hinnoittelu (optional/placeholder), Kirjaudu, Luo tili (primary button).
- **Header (logged in):** logo, nav: Vahtialueet, Ilmoitukset, account menu (avatar/initials → Tili, Asetukset, Kirjaudu ulos).
- **Footer:** links to Tietosuojaseloste, Käyttöehdot, Evästeet, Saavutettavuusseloste, Yhteystiedot; data attributions; © line.
- **Cookie/consent banner:** shown on first visit. Two equal-weight buttons "Hyväksy kaikki" / "Vain välttämättömät" and a "Mukauta" link opening a modal with categories: Välttämättömät (always on, locked), Analytiikka, (Markkinointi — omit if unused). Banner must not block reading the privacy policy. A persistent "Evästeasetukset" link in the footer reopens it.
- **Toasts / inline alerts:** success, error, info.
- **Empty states, loading skeletons, and error states** for every data view.
- **Map component** (reused everywhere): MapLibre map with a background map, a semi-transparent overlay of forest-use declaration polygons (colour-coded by cutting type: harvennus = light amber, uudistushakkuu = red-orange, muu = grey), the user's watch area as a green circle/polygon, a legend, zoom controls, and a "Keskitä vahtialueeseen" button. Clicking a polygon opens a small popover with cutting type, area (ha), declaration date, and distance to the watch area.

---

## Public / marketing pages

### 1. Landing page `/`

- Hero: headline ("Tiedä, jos naapurimetsääsi ollaan hakkaamassa"), one-sentence explanation, primary CTA "Luo vahtialue", secondary "Miten se toimii".
- Illustrative map screenshot/mockup with a watch circle and highlighted declaration polygons.
- "Miten se toimii" 3-step strip: 1) Merkitse tontti kartalle, 2) Valitse säde, 3) Saat sähköpostin kun uusi metsänkäyttöilmoitus ilmestyy alueelle.
- "Mitä metsänkäyttöilmoitus on" explainer box (it is an intention, not a guarantee; must be filed ≥10 days before cutting; valid 3 years; small household cuts are exempt).
- Trust section: data source = Suomen metsäkeskus open data, no landowner personal data shown, free tier.
- FAQ accordion (5–8 questions).
- Final CTA.

### 2. Miten se toimii `/miten-se-toimii`

Longer explainer with diagrams of the 2×/day check cycle and what an alert email looks like.

### 3. Hinnoittelu `/hinnoittelu` (placeholder)

Simple card(s): Ilmainen (1–2 watch areas, email alerts). Room for a paid tier later. Can be hidden in v1.

### 4. Yhteystiedot `/yhteystiedot`

Contact form (name, email, message, consent checkbox linking to privacy policy) + service email address.

---

## Legal / GDPR pages (all plain-text-heavy, readable typography, table of contents on desktop, "Päivitetty pp.kk.vvvv" date at top)

### 5. Tietosuojaseloste `/tietosuoja`

Sections: Rekisterinpitäjä ja yhteystiedot; Mitä tietoja keräämme (account email, name optional, watch-area coordinates and radius, alert history, login/technical logs, cookie/consent choices); Käsittelyn tarkoitus ja oikeusperuste (sopimus, suostumus, oikeutettu etu); Tietolähteet; Säilytysajat; Tietojen luovutukset ja käsittelijät (email provider, hosting, analytics); Siirrot EU/ETA-alueen ulkopuolelle; Rekisteröidyn oikeudet (tarkastus, oikaisu, poisto, rajoittaminen, siirto, vastustaminen, suostumuksen peruuttaminen, valitus tietosuojavaltuutetulle) with direct links to the in-app self-service actions (export, delete); Automaattinen päätöksenteko (ei); Muutokset selosteeseen.

### 6. Käyttöehdot `/kayttoehdot`

Service description, that alerts are informational and based on third-party open data, no guarantee of completeness/timeliness, acceptable use, account termination, liability limits, governing law (Finland), changes.

### 7. Evästeet `/evasteet`

Cookie table (name, purpose, category, lifetime) and a button to reopen consent settings.

### 8. Saavutettavuusseloste `/saavutettavuus`

Accessibility statement (WCAG 2.1 AA target, known issues, feedback channel).

### 9. Tietopyyntö `/tietopyynto` (optional public form)

For non-logged-in data subject requests: email, request type (tarkastus / poisto / muu), message, consent checkbox.

---

## Authentication pages (centered card layout, logo on top, link back to home)

### 10. Luo tili `/rekisteroidy`

Fields: sähköposti, salasana (strength meter, show/hide), salasana uudelleen. Required checkbox: "Olen lukenut tietosuojaselosteen ja hyväksyn käyttöehdot" (links inline). Optional checkbox: "Saa lähettää palveluun liittyviä uutisia" (unchecked by default). Button "Luo tili". Link "Onko sinulla jo tili? Kirjaudu".
After submit → **Vahvista sähköposti** screen: "Lähetimme vahvistuslinkin osoitteeseen …", resend button with cooldown, change-email link.

### 11. Sähköposti vahvistettu `/vahvista?token=…`

Success state → CTA "Luo ensimmäinen vahtialue". Error states: expired / already used, with resend option.

### 12. Kirjaudu `/kirjaudu`

Email, password, "Muista minut", "Unohditko salasanan?", submit. Error state for wrong credentials and for unverified email (with resend link). Link to registration.

### 13. Unohtunut salasana `/unohtunut-salasana`

Email field → neutral confirmation ("Jos osoite on rekisteröity, lähetimme ohjeet").

### 14. Uusi salasana `/uusi-salasana?token=…`

New password + confirm, then success → login.

### 15. Kirjauduttu ulos `/kirjauduttu-ulos` (or toast on landing)

---

## App pages (logged in; left sidebar on desktop, bottom tab bar on mobile: Vahtialueet · Ilmoitukset · Tili)

### 16. Onboarding (first login, `/aloita`)

3-step wizard, skippable:

1. Merkitse sijainti — address search field (geocoding autocomplete) OR "Käytä sijaintiani" OR tap on the map; draggable pin.
2. Valitse säde — segmented control 250 m / 500 m / 1 km / 2 km + custom slider; live circle preview on map; text "Alueella on tällä hetkellä N voimassa olevaa metsänkäyttöilmoitusta".
3. Nimeä ja vahvista — name ("Mökki, Rääkkylä"), notification toggle (email on/off), "Tallenna vahtialue".

### 17. Vahtialueet (dashboard) `/vahtialueet`

- Header with "Uusi vahtialue" button (disabled with tooltip when plan limit reached).
- Card list (mobile) / table (desktop): name, location text, radius, active declarations count, last checked timestamp, badge "Uusia: N", toggle for notifications, kebab menu (Muokkaa, Poista).
- Overview map showing all watch areas.
- Empty state with illustration and CTA.
- Status strip: "Tiedot päivitetty viimeksi pp.kk.vvvv klo hh:mm (Metsäkeskus)".

### 18. Vahtialue — detail `/vahtialueet/[id]`

- Large map (full width, ~60% of viewport on mobile) with the watch area and all intersecting declarations.
- Right/below panel: list of declarations sorted by newest, each row: cutting type chip, area in ha, distance from centre, declaration received date, "Uusi" badge, expand → details (all attributes in plain Finnish, note "Ilmoitus on hakkuuaikomus, ei velvoite hakata").
- Filters: cutting type, only new, date range.
- Actions: Muokkaa, Ilmoitusasetukset, Poista (confirm dialog).

### 19. Vahtialue — edit `/vahtialueet/[id]/muokkaa`

Same form as onboarding steps 1–3 on one page.

### 20. Ilmoitukset (alert feed) `/ilmoitukset`

Chronological feed across all watch areas: date group headers, each item: watch area name, cutting type, area, distance, "Näytä kartalla". Mark all as read. Empty state: "Ei uusia ilmoituksia — hyvä merkki."

### 21. Ilmoitus — detail `/ilmoitukset/[id]`

Map zoomed to the polygon + full attributes + link to Metsäkeskus map service + "Mitä tämä tarkoittaa?" explainer.

---

## Account & settings

### 22. Tili `/tili`

Profile: email (change with re-verification flow), name (optional), language (fi/en), timezone (default Europe/Helsinki).

### 23. Turvallisuus `/tili/turvallisuus`

Change password (current + new), active sessions list with "Kirjaa ulos muista laitteista", 2FA placeholder (later).

### 24. Ilmoitusasetukset `/tili/ilmoitukset`

Global email notifications on/off, digest mode (heti / päivittäin klo 09 / viikoittain), per-watch-area overrides table, marketing consent toggle (mirrors registration checkbox), test-email button.

### 25. Tietosuoja ja tiedot `/tili/tietosuoja` (GDPR self-service)

- "Lataa tietoni" — export button (JSON + GeoJSON of watch areas, alert history); shows "Valmistellaan… lähetämme linkin sähköpostiin" state.
- Consent history (what was accepted and when).
- Cookie settings shortcut.
- Link to privacy policy and to the supervisory authority.

### 26. Poista tili `/tili/poista`

Explanation of what is deleted (account, watch areas, alerts) and retention of anonymised logs; confirmation requires typing "POISTA" + password; final screen "Tilisi on poistettu".

---

## System / utility pages

- 404 `Sivua ei löytynyt` with search/back links; 500 `Jotain meni pieleen`.
- Maintenance page.
- Rate-limited / too many requests state.
- Verification required interstitial (if unverified user hits app pages).
- Plan-limit upsell modal (placeholder).

---

## Transactional emails (design as simple, mobile-first templates with the same palette)

1. Vahvista sähköpostiosoitteesi.
2. Salasanan palautus.
3. **Uusi metsänkäyttöilmoitus vahtialueellasi** — the core email: watch area name, static map image (or placeholder), cutting type in plain Finnish, area, distance, date, CTA "Näytä kartalla", explainer line, unsubscribe/settings links, attribution.
4. Päivittäinen/viikoittainen kooste (multiple items).
5. Tietojen vienti on valmis (download link, expires in 24 h).
6. Tilisi on poistettu.
7. Sähköpostiosoitteen vaihto — vahvista.

---

## Accessibility & behaviour requirements

- WCAG 2.1 AA: colour contrast, focus states, keyboard-operable map controls with a non-map fallback (address + radius fields work without the map).
- Cutting-type colours always paired with text labels/icons.
- Form errors inline and announced; all timestamps in Europe/Helsinki.
- Consent choices and legal links available before login (footer on auth pages too).
- Design tokens exported for Tailwind (colours, spacing, radius, type scale) so the handoff to Claude Code is direct.
