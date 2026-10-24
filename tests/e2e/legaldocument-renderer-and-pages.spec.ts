import { LEGAL_DOCUMENT_TITLES, PLACEHOLDER_VERSION } from '@/lib/legal/documents'
import { expectNoA11yViolations } from './a11y'
import { E2E_LEGAL_SECTIONS, expect, test } from './fixtures'

/** The four routes, their footer link and the sections the page adds before the document's. */
const PAGES = [
  { path: '/tietosuoja', slug: 'privacy', footer: 'Tietosuojaseloste', extra: [] },
  { path: '/kayttoehdot', slug: 'terms', footer: 'Käyttöehdot', extra: [] },
  { path: '/evasteet', slug: 'cookies', footer: 'Evästeet', extra: ['Käytetyt evästeet'] },
  { path: '/saavutettavuus', slug: 'accessibility', footer: 'Saavutettavuusseloste', extra: [] },
] as const

const UPDATED = new RegExp(
  `^Päivitetty \\d{1,2}\\.\\d{1,2}\\.\\d{4} · Versio ${PLACEHOLDER_VERSION}$`,
)

/**
 * MV-091: the four legal routes render the latest published document (db.setup.ts seeds a
 * lead paragraph and `E2E_LEGAL_SECTIONS`) with its date and version and numbered sections,
 * pass axe, and on desktop list the sections in a table of contents whose links land on them.
 * `/evasteet` adds the cookie table from `config/cookies.ts` and "Avaa evästeasetukset".
 */
test.describe('legal pages', () => {
  for (const { path, slug, extra } of PAGES) {
    const titles = [...extra, ...E2E_LEGAL_SECTIONS.map((s) => s.title)]

    test(`${path} renders the latest published document`, async ({ page }) => {
      await page.goto(path)
      const title = LEGAL_DOCUMENT_TITLES[slug]
      await expect(page).toHaveTitle(`${title} · Metsävahti`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
      await expect(page.getByText(UPDATED)).toBeVisible()
      await expect(page.getByText(`${title} – luonnos.`)).toBeVisible()
      await expect(page.getByRole('heading', { level: 2 })).toHaveText(
        titles.map((t, i) => `${i + 1}. ${t}`),
      )
      await expect(page.getByTestId('attribution').first()).toBeVisible()
      await expectNoA11yViolations(page)
    })

    test.describe('desktop', () => {
      test.use({ viewport: { width: 1280, height: 720 } })

      test(`${path} TOC links land on their sections`, async ({ page }) => {
        await page.goto(path)
        const toc = page.getByRole('navigation', { name: 'Sisältö' })
        await expect(toc.getByRole('link')).toHaveText(titles)
        await toc.getByRole('link', { name: 'Säilytysajat' }).click()
        await expect(page).toHaveURL(new RegExp(`${path}#sailytysajat$`))
        const section = page.getByRole('region', { name: /Säilytysajat/ })
        await expect(section).toHaveAttribute('id', 'sailytysajat')
        await expect(section).toBeInViewport()
        await expect(section.getByText(E2E_LEGAL_SECTIONS[1]!.paragraphs[0]!)).toBeVisible()
        await expectNoA11yViolations(page)
      })
    })
  }

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('the TOC is a desktop aid', async ({ page }) => {
      await page.goto('/tietosuoja')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByTestId('legal-toc')).toBeHidden()
    })
  })

  test('/evasteet lists the cookies and opens the cookie settings', async ({ page }) => {
    await page.goto('/evasteet')
    await expect(page.locator('[data-testid="consent"][data-hydrated]')).toBeAttached()

    const table = page.getByRole('table', { name: 'Palvelun käyttämät evästeet' })
    await expect(table.getByRole('columnheader')).toHaveText([
      'Nimi',
      'Tarkoitus',
      'Luokka',
      'Voimassa',
    ])
    await expect(table.getByRole('row')).toHaveText([
      /Nimi/,
      /payload-token\s*Kirjautumisistunto\s*Välttämätön\s*1 pv \/ 30 pv \(Muista minut\)/,
      /mv_consent\s*Suostumusvalinnat\s*Välttämätön\s*12 kk/,
    ])

    await page.getByRole('button', { name: 'Avaa evästeasetukset' }).click()
    const dialog = page.getByRole('dialog', { name: 'Evästeasetukset' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Sulje' }).click()
    await expect(dialog).toBeHidden()
  })

  test('the footer links reach every legal page', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('navigation', { name: 'Oikeudelliset tiedot' })
    for (const { path, slug, footer: label } of PAGES) {
      await footer.getByRole('link', { name: label, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(LEGAL_DOCUMENT_TITLES[slug])
    }
  })
})
