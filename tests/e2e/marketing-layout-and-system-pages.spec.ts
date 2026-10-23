import { AUTH_STATE } from '../../playwright.config'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const attributionPattern =
  /Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa \d{2}\/\d{4}/

test.describe('marketing layout', () => {
  test('frames the landing page with the site header and footer', async ({ page }) => {
    await page.goto('/')

    const header = page.getByRole('banner')
    await expect(header.getByRole('link', { name: 'Metsävahti' })).toHaveAttribute('href', '/')
    const nav = header.getByRole('navigation', { name: 'Päävalikko' })
    await expect(nav.getByRole('link', { name: 'Miten se toimii' })).toHaveAttribute(
      'href',
      '/miten-se-toimii',
    )
    await expect(nav.getByRole('link', { name: 'Hinnoittelu' })).toHaveAttribute(
      'href',
      '/hinnoittelu',
    )
    await expect(nav.getByRole('link', { name: 'Kirjaudu', exact: true })).toHaveAttribute(
      'href',
      '/kirjaudu',
    )
    await expect(nav.getByRole('link', { name: 'Luo tili' })).toHaveAttribute(
      'href',
      '/rekisteroidy',
    )

    const footer = page.getByRole('contentinfo')
    const legal = footer.getByRole('navigation', { name: 'Oikeudelliset tiedot' })
    await expect(legal.getByRole('link')).toHaveText([
      'Tietosuojaseloste',
      'Käyttöehdot',
      'Evästeet',
      'Saavutettavuusseloste',
      'Yhteystiedot',
    ])
    await expect(legal.getByRole('button', { name: 'Evästeasetukset' })).toBeVisible()
    await expect(footer.getByTestId('attribution')).toContainText(attributionPattern)
    await expect(footer).toContainText(`© ${new Date().getFullYear()} Metsävahti`)

    await expectNoA11yViolations(page)
  })

  test('the cookie-settings button announces the request to the consent modal', async ({
    page,
  }) => {
    await page.goto('/')
    const fired = page.evaluate(
      () =>
        new Promise<string>((resolve) =>
          window.addEventListener(
            'metsavahti:open-cookie-settings',
            (event) => resolve(event.type),
            {
              once: true,
            },
          ),
        ),
    )
    await page.getByRole('button', { name: 'Evästeasetukset' }).click()
    await expect(fired).resolves.toBe('metsavahti:open-cookie-settings')
  })

  test('keeps the attribution footer on the logged-in pages', async ({ browser }) => {
    // The (app) group reuses the frame until the app shell (MV-050) replaces it.
    const context = await browser.newContext({ storageState: AUTH_STATE })
    const page = await context.newPage()
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vahtialueesi')
    await expect(page.getByRole('contentinfo').getByTestId('attribution')).toContainText(
      attributionPattern,
    )
    await context.close()
  })
})

test.describe('system pages', () => {
  test('an unknown URL returns 404 and the not-found page inside the frame', async ({ page }) => {
    const response = await page.goto('/tata-sivua-ei-ole')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sivua ei löytynyt')
    await expect(page.getByTestId('system-code')).toHaveText('404')
    await expect(page.getByRole('contentinfo').getByTestId('attribution')).toContainText(
      attributionPattern,
    )
    await expectNoA11yViolations(page)

    await page.getByRole('link', { name: 'Etusivulle' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('a deeper unknown URL is also a 404', async ({ page }) => {
    const response = await page.goto('/dashboard/ei/ole')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sivua ei löytynyt')
  })

  test('/huolto shows the maintenance page', async ({ page }) => {
    await page.goto('/huolto')
    await expect(page).toHaveTitle('Huoltotauko · Metsävahti')
    await expect(page.getByTestId('system-code')).toHaveText('HUOLTO')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Metsävahti on huoltotauolla')
    await expect(page.getByRole('main')).toContainText('Palaamme noin klo 07.00.')
    await expect(page.getByRole('link', { name: 'Yritä uudelleen' })).toHaveAttribute('href', '/')
    await expect(page.getByTestId('attribution')).toContainText(attributionPattern)
    await expectNoA11yViolations(page)
  })

  test('a page that throws renders the error boundary with a Sentry event id', async ({ page }) => {
    // /virhe throws on purpose (ENABLE_ERROR_TEST_ROUTE=1 in .env.test), which renders the
    // root error.tsx. global-error.tsx shares ErrorState and SiteFrame with it, so the same
    // UI is covered; it only differs by rendering its own <html> and <body>.
    const response = await page.goto('/virhe')
    expect(response?.status()).toBe(500)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jotain meni pieleen')
    await expect(page.getByTestId('system-code')).toHaveText('500')
    await expect(page.getByRole('main')).toContainText('Palvelussa tapahtui virhe.')
    // Without a DSN the SDK still returns a locally generated 32-hex event id.
    await expect(page.getByText(/^Virhetunnus: [0-9a-f]{32}$/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Etusivulle' })).toHaveAttribute('href', '/')
    await expect(page.getByRole('contentinfo').getByTestId('attribution')).toContainText(
      attributionPattern,
    )
    await expectNoA11yViolations(page)

    // Retrying re-renders the route, which throws again and lands back on the boundary.
    await page.getByRole('button', { name: 'Yritä uudelleen' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jotain meni pieleen')
  })

  test('/liikaa-pyyntoja shows the rate-limit page and goes back on retry', async ({ page }) => {
    await page.goto('/huolto')
    await page.goto('/liikaa-pyyntoja')
    await expect(page).toHaveTitle('Liian monta pyyntöä · Metsävahti')
    await expect(page.getByTestId('system-code')).toHaveText('429')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Liian monta pyyntöä')
    await expect(page.getByTestId('attribution')).toContainText(attributionPattern)
    await expectNoA11yViolations(page)

    await page.getByRole('button', { name: 'Yritä uudelleen' }).click()
    await expect(page).toHaveURL(/\/huolto$/)
  })
})
