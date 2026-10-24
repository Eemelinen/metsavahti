import { plans } from '@/config/plans'
import { MAX_RADIUS_M, MIN_RADIUS_M } from '@/lib/watch-areas/watch-area-schema'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const attributionPattern =
  /Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa \d{2}\/\d{4}/

/**
 * Every `(marketing)` page of `03-pages.md`. `.env.test` sets `SHOW_PRICING=1`, so
 * `/hinnoittelu` is served. The flag-off half is unit-tested: the page's 404
 * (`tests/unit/marketing/pricing-page.test.ts`), the header links (`routes.test.ts`) and the
 * sitemap (`landing-page.test.ts`).
 */
const MARKETING_PAGES = [
  { path: '/', name: 'etusivu' },
  { path: '/miten-se-toimii', name: 'miten-se-toimii' },
  { path: '/hinnoittelu', name: 'hinnoittelu' },
  { path: '/yhteystiedot', name: 'yhteystiedot' },
] as const

/** MV-101: `/miten-se-toimii`, `/hinnoittelu` and the visual baseline of the marketing pages. */
test.describe('marketing pages', () => {
  test('/miten-se-toimii explains the check cycle and the alert email @smoke', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Päävalikko' })
      .getByRole('link', { name: 'Miten se toimii' })
      .click()
    await expect(page).toHaveURL('/miten-se-toimii')
    // A full load, as a crawler sees it: right after the client-side navigation the landing
    // page's canonical can still be in the head next to this page's.
    await page.reload()
    await expect(page).toHaveTitle('Miten se toimii · Metsävahti')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Kaksi tarkistusta päivässä, yksi sähköposti kun jotain tapahtuu',
    )
    const main = page.getByRole('main')
    for (const heading of [
      'Tarkistuskierto',
      'Tällainen sähköposti tulee',
      'Mitä palvelu ei tee',
    ]) {
      await expect(main.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    }

    // Illustration 1: the twice-daily cycle, at the sync times of 01 §2.
    const cycle = main.getByRole('region', { name: 'Tarkistuskierto' })
    await expect(cycle.getByRole('listitem')).toHaveCount(4)
    await expect(cycle).toContainText('klo 9.30 ja joka ilta klo 21.30')
    await expect(cycle.getByRole('figure')).toHaveAccessibleName(
      /tarkistus klo 9\.30 ja klo 21\.30/,
    )

    // Illustration 2: the sample email, its harvest colour paired with the label.
    const email = main.getByRole('figure', { name: 'Esimerkkisähköposti' })
    await expect(email).toContainText('Uusi metsänkäyttöilmoitus vahtialueellasi')
    await expect(email).toContainText('Uudistushakkuu · 3,4 ha')
    await expect(email.getByRole('img', { name: /hakkuualue vahtialueen sisällä/ })).toBeVisible()

    await expect(page.getByTestId('attribution')).toContainText(attributionPattern)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${new URL(baseURL!).origin}/miten-se-toimii`,
    )
    await expectNoA11yViolations(page)

    await main.getByRole('link', { name: 'Luo vahtialue' }).click()
    await expect(page).toHaveURL('/rekisteroidy')
  })

  test('/hinnoittelu shows the plan cards from plans.ts @smoke', async ({ page, baseURL }) => {
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Päävalikko' })
      .getByRole('link', { name: 'Hinnoittelu' })
      .click()
    await expect(page).toHaveURL('/hinnoittelu')
    // A full load, as a crawler sees it: right after the client-side navigation the landing
    // page's canonical can still be in the head next to this page's.
    await page.reload()
    await expect(page).toHaveTitle('Hinnoittelu · Metsävahti')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hinnoittelu')

    const free = page.getByRole('region', { name: plans.free.label })
    await expect(free).toContainText(`${plans.free.monthlyPriceEur} €`)
    await expect(free.getByRole('listitem')).toContainText([
      `Enintään ${plans.free.maxWatchAreas} vahtialuetta`,
      `Säde ${MIN_RADIUS_M} m – ${MAX_RADIUS_M / 1000} km`,
    ])
    const upcoming = page.getByRole('region', { name: 'Laaja' })
    await expect(upcoming).toContainText('Tulossa')
    await expect(
      upcoming.getByRole('link', { name: 'Ilmoita kun taso julkaistaan' }),
    ).toHaveAttribute('href', '/yhteystiedot')

    await expect(page.getByTestId('attribution')).toContainText(attributionPattern)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${new URL(baseURL!).origin}/hinnoittelu`,
    )
    await expectNoA11yViolations(page)

    await free.getByRole('link', { name: 'Luo tili' }).click()
    await expect(page).toHaveURL('/rekisteroidy')
  })

  test('sitemap.xml lists the explainer and, with SHOW_PRICING, the pricing page', async ({
    request,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin
    const xml = await (await request.get('/sitemap.xml')).text()
    expect(xml).toContain(`<loc>${origin}/miten-se-toimii</loc>`)
    expect(xml).toContain(`<loc>${origin}/hinnoittelu</loc>`)
  })

  test.describe('visual snapshots', () => {
    test.use({ reducedMotion: 'reduce' })

    for (const { path, name } of MARKETING_PAGES) {
      test(`${path} matches its baseline @visual`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)

        const footer = page.getByRole('contentinfo')
        await expect(page).toHaveScreenshot(`${name}.png`, {
          fullPage: true,
          // The attribution month and the copyright year change with the calendar.
          mask: [footer.getByTestId('attribution'), footer.getByText(/^© \d{4} Metsävahti$/)],
        })
      })
    }
  })
})
