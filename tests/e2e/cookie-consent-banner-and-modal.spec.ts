import type { Page } from '@playwright/test'

import { CONSENT_COOKIE, parseConsentCookie } from '@/lib/consent/consent-cookie'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

/** `.env.test`: a host that never resolves; every request to it is answered here. */
const ANALYTICS_URL = process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL!

/** Count the analytics script requests of `page` and answer them with an empty script. */
async function countAnalytics(page: Page): Promise<() => number> {
  let hits = 0
  await page.route(ANALYTICS_URL, async (route) => {
    hits += 1
    await route.fulfill({ contentType: 'text/javascript', body: '' })
  })
  return () => hits
}

/**
 * The banner's buttons only work once React has hydrated the consent root; by then the
 * effect that would add the analytics `<script data-analytics>` has run as well.
 */
async function open(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('[data-testid="consent"][data-hydrated]')).toBeAttached()
}

/** No analytics `<script>` on the page and no request for it so far. */
async function expectNoAnalytics(page: Page, hits: () => number, expected = 0) {
  await expect(page.locator('script[data-analytics]')).toHaveCount(0)
  expect(hits()).toBe(expected)
}

async function storedConsent(page: Page) {
  const cookie = (await page.context().cookies()).find((c) => c.name === CONSENT_COOKIE)
  return parseConsentCookie(cookie?.value)
}

/**
 * MV-090: a first visit shows the banner once; the choice is stored in `mv_consent` and
 * survives reloads and other pages; the analytics script is requested only after analytics
 * is granted; "Mukauta" and the footer "Evästeasetukset" open the modal.
 */
test.describe('cookie consent', () => {
  test.use({ consentChoice: false, storageState: { cookies: [], origins: [] } })

  test('the banner is shown once and "Vain välttämättömät" loads no analytics', async ({
    page,
  }) => {
    const analytics = await countAnalytics(page)
    await open(page, '/')
    const banner = page.getByRole('region', { name: 'Evästeet' })
    await expect(banner).toBeVisible()
    await expect(banner.getByRole('button')).toHaveText([
      'Hyväksy kaikki',
      'Vain välttämättömät',
      'Mukauta',
    ])
    await expect(banner.getByRole('link', { name: 'Lue lisää evästeistä' })).toHaveAttribute(
      'href',
      '/evasteet',
    )
    await expectNoA11yViolations(page)

    await banner.getByRole('button', { name: 'Vain välttämättömät' }).click()
    await expect(banner).toBeHidden()
    expect(await storedConsent(page)).toMatchObject({ necessary: true, analytics: false })

    await open(page, '/')
    await expect(page.getByTestId('attribution').first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'Evästeet' })).toHaveCount(0)
    await open(page, '/kirjaudu')
    await expect(page.getByRole('region', { name: 'Evästeet' })).toHaveCount(0)
    await expectNoAnalytics(page, analytics)
  })

  test('"Hyväksy kaikki" loads the analytics script, and again on the next page', async ({
    page,
  }) => {
    const analytics = await countAnalytics(page)
    await open(page, '/')
    await expectNoAnalytics(page, analytics)

    await page.getByRole('button', { name: 'Hyväksy kaikki' }).click()
    await expect(page.getByRole('region', { name: 'Evästeet' })).toBeHidden()
    await expect.poll(analytics).toBe(1)
    expect(await storedConsent(page)).toMatchObject({ analytics: true })

    await open(page, '/kirjaudu')
    await expect(page.getByRole('region', { name: 'Evästeet' })).toHaveCount(0)
    await expect.poll(analytics).toBe(2)
  })

  test('"Mukauta" grants analytics and the footer "Evästeasetukset" withdraws it', async ({
    page,
  }) => {
    const analytics = await countAnalytics(page)
    await open(page, '/')
    await page.getByRole('button', { name: 'Mukauta' }).click()

    const dialog = page.getByRole('dialog', { name: 'Evästeasetukset' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('switch', { name: 'Välttämättömät' })).toBeChecked()
    await expect(dialog.getByRole('switch', { name: 'Välttämättömät' })).toBeDisabled()
    const analyticsSwitch = dialog.getByRole('switch', { name: 'Analytiikka' })
    await expect(analyticsSwitch).not.toBeChecked()
    await expectNoA11yViolations(page)

    await analyticsSwitch.click()
    await dialog.getByRole('button', { name: 'Tallenna valinnat' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('region', { name: 'Evästeet' })).toBeHidden()
    expect(await storedConsent(page)).toMatchObject({ analytics: true })
    await expect.poll(analytics).toBe(1)

    // Reopen from the footer: the stored choice is shown; withdrawing it reloads the page
    // so the loaded script is gone.
    await page.getByRole('contentinfo').getByRole('button', { name: 'Evästeasetukset' }).click()
    await expect(dialog).toBeVisible()
    await expect(analyticsSwitch).toBeChecked()
    await analyticsSwitch.click()
    const reloaded = page.waitForEvent('load')
    await dialog.getByRole('button', { name: 'Tallenna valinnat' }).click()
    await reloaded
    await expect(page.locator('[data-testid="consent"][data-hydrated]')).toBeAttached()
    expect(await storedConsent(page)).toMatchObject({ analytics: false })
    await expect(page.getByRole('region', { name: 'Evästeet' })).toHaveCount(0)
    await expectNoAnalytics(page, analytics, 1)

    // "Sulje" keeps the stored choice.
    await page.getByRole('contentinfo').getByRole('button', { name: 'Evästeasetukset' }).click()
    await analyticsSwitch.click()
    await dialog.getByRole('button', { name: 'Sulje' }).click()
    await expect(dialog).toBeHidden()
    expect(await storedConsent(page)).toMatchObject({ analytics: false })
  })
})
