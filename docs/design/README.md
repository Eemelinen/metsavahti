# Design

Claude Design output for Metsävahti (brief: [../product/03b-ui-design-brief.md](../product/03b-ui-design-brief.md)).
The artboards are the visual source of truth; the tokens are the app's Tailwind theme; every
page ticket is linked to its artboard in [design-map.json](design-map.json) and therefore in the
`design` field of its feature in `feature_list.json`.

## Artboards

Open any `.dc.html` in a browser (the runtime `support.js` loads React from a CDN; `data.js`,
`map.js` and `tokens.js` are the prototype's data, MapLibre helper and tokens). Each artboard
exposes props; the route or template is selected with the pill navigation or the URL hash.

| File                    | What it shows                                                                                                                                                                                                                                                                       | Select by                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Metsävahti.dc.html`    | The canvas: `App.dc.html` in a desktop browser frame and a phone frame, links to every other artboard.                                                                                                                                                                              | route switcher                                                                     |
| `App.dc.html`           | The logged-in product and auth flow. Routes: `kirjaudu`, `rekisteroidy`, `vahvista`, `vahvistettu`, `unohtunut`, `uusi_salasana`, `kirjauduttu_ulos`, `aloita` (3-step wizard), `vahtialueet`, `alue`, `alue_muokkaa`, `ilmoitukset`, `ilmoitus`, `tili`, `turvallisuus`, `ilmoitusasetukset`, `tietosuoja`, `poista`, `404`, `500`, `huolto`, `rajoitus`, `vahvistus_vaaditaan`. States: empty, loading skeleton, toasts, confirm dialog, plan-limit modal, consent banner. | `route` prop (`#route=<value>` in design-map.json)                                 |
| `Landing.dc.html`       | Marketing home. Hero variants A (map), **B (typography — the chosen one)**, C (email); 3-step strip, explainer, FAQ accordion, CTA, footer with attribution, cookie banner + consent modal.                                                                                            | `hero` prop; `#hero=B`, `#faq`, `#consent`, `#header-footer`                        |
| `Miten.dc.html`         | `/miten-se-toimii`: the twice-daily check cycle, a sample email, what the service does not do.                                                                                                                                                                                       | —                                                                                  |
| `Hinnoittelu.dc.html`   | `/hinnoittelu`: free tier card and a "coming" tier.                                                                                                                                                                                                                                 | —                                                                                  |
| `Yhteystiedot.dc.html`  | `/yhteystiedot` contact form and `/tietopyynto` data-request form (radio cards), validation and success states.                                                                                                                                                                       | `#tietopyynto`                                                                     |
| `Legal.dc.html`         | `/tietosuoja`, `/kayttoehdot`, `/evasteet` (cookie table + "Avaa evästeasetukset"), `/saavutettavuus`; sticky TOC.                                                                                                                                                                  | `#tietosuoja`, `#kayttoehdot`, `#evasteet`, `#saavutettavuus`                       |
| `Email.dc.html`         | Seven transactional emails as table-based HTML: 1 verify, 2 password reset, 3 new alert, 4 digest, 5 export ready, 6 account deleted, 7 email change.                                                                                                                                | `#template=<n>`, `#layout`                                                          |

Decisions taken from the artboards: landing hero **B**; a dedicated "Kirjauduttu ulos" screen
(`00-deviations` R2); no dark theme (R13).

## Tokens

`tokens.js` is the export from Claude Design. It is applied in two places that a unit test keeps
identical (`tests/unit/design/tokens.test.ts`):

- `src/app/globals.css` — the Tailwind 4 theme (`@theme`). The default Tailwind palette is removed
  (`--color-*: initial`), so only these colours exist as utilities.
- `src/lib/design-tokens.ts` — the same values as constants for code that cannot use classes:
  MapLibre paint properties and React Email inline styles.

| Group      | Utilities                                                                             | Use for                                                                    |
| ---------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `forest`   | `bg-forest-700`, `text-forest-600`, … (50, 100, 200, 300, 500, 600, 700, 800, 900)    | Brand: primary buttons (700), links and rings (600), tints (50–200)        |
| `sage`     | 300, 500, 700                                                                         | Secondary text and borders                                                 |
| `amber`    | 100, 300, 500, 700                                                                    | Attention, harvennus (thinning)                                            |
| `ember`    | 100, 500, 700                                                                         | Destructive, uudistushakkuu (regeneration felling)                         |
| `ink`      | `text-ink`, `text-ink-muted`, `text-ink-faint`                                        | Body text hierarchy                                                        |
| `paper`    | `bg-paper`, `bg-paper-raised`, `bg-paper-sunken`                                      | Page background, cards, sunken surfaces (segmented controls, tables)       |
| `line`     | `border-line`, `border-line-strong`                                                   | Borders, inputs                                                            |
| `cut`      | `bg-cut-harvennus`, `bg-cut-uudistus`, `bg-cut-muu`                                   | Harvest-type chips and map polygons; always paired with a label            |
| status     | `text-success`, `text-error`, `text-info`                                             | Form and toast states                                                      |
| radius     | `rounded-sm` 6px · `rounded-md` 8px · `rounded-lg` 10px (default) · `rounded-xl` 14px · `rounded-2xl` 20px · `rounded-full` | Buttons and inputs `lg`, cards `xl`, hero pills `full`     |
| shadow     | `shadow-card`, `shadow-pop`                                                           | Cards, popovers                                                            |
| type scale | `text-xs` … `text-4xl` with the design line heights and letter spacing                | Headings `2xl`–`4xl` in Figtree 700                                         |
| font       | `font-sans` = Figtree (loaded with `next/font` in the frontend layout)                | Everything in the app; emails use the Helvetica/Arial fallback stack       |

The shadcn semantic names still work and map onto the tokens (`bg-background` = paper,
`text-foreground` = ink, `bg-primary` = forest-700, `bg-muted` = paper-sunken, `border-border` =
line, `ring-ring` = forest-600, `text-destructive` = error). Prefer the semantic name inside
shadcn components and the token name in product code.

## Rules (enforced by `pnpm lint`, part of L1)

1. Style with theme utilities only. **No arbitrary values** (`bg-[#1E4A37]`, `h-[420px]`,
   `text-[0.8rem]`): add a token to `globals.css` instead (`h-105` is 420px on the default
   spacing scale; named grid templates live under `--grid-template-*`).
2. **No raw Tailwind palette colours** (`text-gray-500`, `bg-blue-600`): they do not exist in the
   theme and are reported as unknown classes.
3. **No inline `style` props.** Exceptions, each with an `eslint-disable` comment: the MapLibre
   container (`react-map-gl` requires `style`), and React Email templates
   (`src/emails/**`, `src/lib/notifications/**`), whose colours must come from
   `src/lib/design-tokens.ts`.
4. **No colour literals in `src/`** outside `design-tokens.ts` and `globals.css`
   (`tests/unit/design/tokens.test.ts`).
5. Before building a page, open the artboard(s) listed in the feature's `design` field and match
   layout, states and copy. Harvest-type colours are always paired with a text label (WCAG).
6. New tokens are added in both files in the same commit; the test fails otherwise.

Class order is handled by `prettier-plugin-tailwindcss`; the ESLint rules are
`better-tailwindcss/no-unknown-classes`, `no-conflicting-classes`, `no-duplicate-classes`,
`no-restricted-classes` and `react/forbid-dom-props` / `forbid-component-props` for `style`.
