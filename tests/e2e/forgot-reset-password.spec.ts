import type { Page } from '@playwright/test'

import {
  ACCOUNT_PASSWORD as PASSWORD,
  createVerifiedAccount,
  mailpit,
  resetLinks,
  useOwnAddress,
  waitForForm,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const NEW_PASSWORD = 'koivu-suo-lampi-2027'

const outcome = (page: Page) => page.getByTestId('reset-outcome')

async function requestReset(page: Page, email: string): Promise<void> {
  await page.goto('/unohtunut-salasana')
  await waitForForm(page)
  await page.getByLabel('Sähköposti').fill(email)
  await page.getByRole('button', { name: 'Lähetä ohjeet' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Jos osoite on rekisteröity, lähetimme ohjeet salasanan vaihtamiseen sähköpostiin.',
  )
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await waitForForm(page)
  await page.getByLabel('Sähköposti').fill(email)
  await page.getByLabel('Salasana', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
}

/**
 * MV-045: `/kirjaudu` → `/unohtunut-salasana` → Mailpit link → `/uusi-salasana?token=` →
 * `/kirjaudu?reset=1` → login with the new password (`@smoke`); a session from before the
 * reset is rejected; the neutral answer for an unknown address; the used / expired / unknown
 * link state. Every test registers its own account so the browser projects never share one.
 */
test.describe('forgot / reset password', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('resets the password through the emailed link and ends the other session @smoke', async ({
    page,
    browser,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'reset')

    // Another device is logged in before the reset.
    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto('/kirjaudu')
    await login(otherPage, email, PASSWORD)
    await expect(otherPage).toHaveURL('/dashboard')

    await page.goto('/kirjaudu')
    await page.getByRole('link', { name: 'Unohditko salasanan?' }).click()
    await expect(page).toHaveURL('/unohtunut-salasana')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unohtunut salasana')
    await expect(page.getByRole('link', { name: 'Takaisin kirjautumiseen' })).toHaveAttribute(
      'href',
      '/kirjaudu',
    )
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await waitForForm(page)
    await page.getByRole('button', { name: 'Lähetä ohjeet' }).click()
    await expect(page.getByText('Anna kelvollinen sähköpostiosoite')).toBeVisible()
    await page.getByLabel('Sähköposti').fill(email)
    await page.getByRole('button', { name: 'Lähetä ohjeet' }).click()
    await expect(page.getByRole('status')).toContainText('Jos osoite on rekisteröity')
    await expect(page.getByRole('button', { name: 'Lähetä ohjeet' })).toHaveCount(0)
    await expectNoA11yViolations(page)

    const [link] = await resetLinks(email, 1)
    await page.goto(link!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'form')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aseta uusi salasana')
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)
    await waitForForm(page)

    // The browser-side checks: length and match.
    await page.getByLabel('Uusi salasana', { exact: true }).fill('lyhyt')
    await page.getByLabel('Salasana uudelleen').fill('lyhyt')
    await page.getByRole('button', { name: 'Tallenna ja kirjaudu' }).click()
    await expect(page.getByText('Salasanan on oltava vähintään 10 merkkiä')).toBeVisible()
    await page.getByLabel('Uusi salasana', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Salasana uudelleen').fill('jotain-muuta-2026')
    await page.getByRole('button', { name: 'Tallenna ja kirjaudu' }).click()
    await expect(page.getByText('Salasanat eivät täsmää.')).toBeVisible()

    await page.getByLabel('Salasana uudelleen').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Tallenna ja kirjaudu' }).click()
    await expect(page).toHaveURL('/kirjaudu?reset=1')
    await expect(page.getByRole('status')).toHaveText(
      'Salasana vaihdettu. Kirjaudu uudella salasanalla.',
    )
    await expectNoA11yViolations(page)

    // The other device's session is gone on the server.
    await otherPage.goto('/dashboard')
    await expect(otherPage).toHaveURL('/kirjaudu?next=%2Fdashboard')
    await other.close()

    // The old password no longer works, the new one does.
    await login(page, email, PASSWORD)
    await expect(page.getByTestId('login-denied')).toHaveAttribute('data-status', 'invalid')
    await login(page, email, NEW_PASSWORD)
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText(`Kirjautunut: ${email}`)).toBeVisible()

    // The link worked once.
    await page.goto(link!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Linkki on vanhentunut tai jo käytetty',
    )
  })

  test('answers the same for an unknown address and sends it nothing', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const unknown = `unknown-${browserName}-${Date.now()}@metsavahti.test`
    await requestReset(page, unknown)
    // A registered address asked afterwards gets its email; the unknown one still has none.
    const email = await createVerifiedAccount(page, browserName, 'neutral')
    await requestReset(page, email)
    await resetLinks(email, 1)
    const toUnknown = (await mailpit.listMessages()).filter((m) => m.To[0]?.Address === unknown)
    expect(toUnknown).toEqual([])
  })

  test('a made-up or missing token shows the expired-or-used state', async ({ page }) => {
    await page.goto('/uusi-salasana?token=nonsense')
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Linkki on vanhentunut tai jo käytetty',
    )
    await expect(page.getByRole('link', { name: 'Pyydä uusi linkki' })).toHaveAttribute(
      'href',
      '/unohtunut-salasana',
    )
    await expect(page.getByRole('link', { name: 'Takaisin kirjautumiseen' })).toHaveAttribute(
      'href',
      '/kirjaudu',
    )
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await page.goto('/uusi-salasana')
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')
  })
})
