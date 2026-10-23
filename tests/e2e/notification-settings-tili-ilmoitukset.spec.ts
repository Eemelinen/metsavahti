import type { Page } from '@playwright/test'

import { ACCOUNT_PASSWORD, createVerifiedAccount, logIn, mailpit, useOwnAddress } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const TEST_SUBJECT = 'Metsävahti: testisähköposti'

/** The page's controls have hydrated (`data-hydrated`, `useHydrated()`); a click before is lost. */
async function waitForSettings(page: Page) {
  await expect(page.locator('[data-testid="notification-settings"][data-hydrated]')).toBeAttached()
}

/** Every queued save has finished (`aria-busy` is set while one runs). */
async function waitForSaves(page: Page) {
  await expect(page.getByTestId('notification-settings')).not.toHaveAttribute('aria-busy', 'true')
}

/** Create a watch area for `email` through the REST API with a bearer token of its own. */
async function createWatchArea(page: Page, email: string, name: string) {
  const login = await page.request.post('/api/users/login', {
    data: { email, password: ACCOUNT_PASSWORD },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
  const { token } = (await login.json()) as { token: string }
  const area = await page.request.post('/api/watch-areas', {
    headers: { authorization: `JWT ${token}` },
    data: { name, center: [25.75, 62.24], radiusM: 800, addressLabel: 'Jyväskylä' },
  })
  expect(area.ok(), await area.text()).toBeTruthy()
}

/**
 * MV-054: `/tili/ilmoitukset` saves the global switch, the mode, each watch area's switch and
 * the marketing consent as they are changed (a reload shows the saved state), shows the empty
 * state without areas, and "Lähetä testisähköposti" delivers the sample alert to Mailpit.
 * Every test registers its own account, so the three browser projects never share one.
 */
test.describe('notification settings', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  // Registers an account, logs in and waits for an email.
  test.slow()

  test('saves the switches and the mode and sends the test email', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'notify')
    await logIn(page, email, ACCOUNT_PASSWORD, '/tili/ilmoitukset')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tili ja asetukset')
    const tabs = page.getByRole('navigation', { name: 'Tilin osiot' })
    await expect(tabs.locator('a[aria-current="page"]')).toHaveText('Ilmoitusasetukset')
    await expect(page.getByTestId('area-settings-empty')).toContainText(
      'Sinulla ei ole vielä vahtialueita.',
    )
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await waitForSettings(page)
    const global = page.getByRole('switch', { name: 'Sähköposti-ilmoitukset', exact: true })
    const marketing = page.getByRole('switch', { name: 'Palvelun uutiset' })
    await expect(global).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: 'Heti' })).toBeChecked()
    await expect(marketing).toHaveAttribute('aria-checked', 'false')

    await global.click()
    await expect(page.getByText('Asetukset tallennettu.')).toBeVisible()
    await page.getByText('Päivittäin klo 09').click()
    await expect(page.getByRole('radio', { name: 'Päivittäin klo 09' })).toBeChecked()
    await marketing.click()
    await expect(marketing).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Asetukset tallennettu.')).toBeVisible()

    await waitForSaves(page)
    await page.reload()
    await waitForSettings(page)
    await expect(global).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('radio', { name: 'Päivittäin klo 09' })).toBeChecked()
    await expect(marketing).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Lähetä testisähköposti' }).click()
    await expect(page.getByText(`Testisähköposti lähetetty osoitteeseen ${email}.`)).toBeVisible()
    const find = async () =>
      (await mailpit.listMessages()).filter(
        (m) => m.To[0]?.Address === email && m.Subject === TEST_SUBJECT,
      )
    await expect.poll(async () => (await find()).length, { timeout: 15_000 }).toBe(1)
    const message = await mailpit.getMessage((await find())[0]!.ID)
    expect(message.HTML).toContain('Esimerkkialue')
    expect(message.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
  })

  test('switches one watch area on and off', async ({ page, browserName }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'notify-area')
    await logIn(page, email, ACCOUNT_PASSWORD, '/tili/ilmoitukset')
    await createWatchArea(page, email, 'Mökkitontti')
    await page.reload()

    const rows = page.getByTestId('area-settings-row')
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText('Mökkitontti')
    await expect(rows).toContainText('Jyväskylä')
    await expectNoA11yViolations(page)

    await waitForSettings(page)
    const area = page.getByRole('switch', { name: 'Sähköposti-ilmoitukset: Mökkitontti' })
    await expect(area).toHaveAttribute('aria-checked', 'true')
    await area.click()
    await expect(page.getByText('Asetukset tallennettu.')).toBeVisible()
    await waitForSaves(page)

    await page.reload()
    await waitForSettings(page)
    await expect(area).toHaveAttribute('aria-checked', 'false')
  })
})
