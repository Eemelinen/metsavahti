import type { Browser } from '@playwright/test'

import {
  ACCOUNT_PASSWORD,
  createVerifiedAccount,
  logIn,
  logOut,
  useOwnAddress,
  waitForForm,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const NEW_PASSWORD = 'tunturi-koivu-puro-2027'
/** The "other device" of these tests: a Windows Chrome, whatever browser the project runs. */
const OTHER_DEVICE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** A second, signed-in browser context for `email`: the account's "other device". */
async function otherDevice(browser: Browser, email: string) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    userAgent: OTHER_DEVICE_UA,
  })
  // Logins have no per-address limit (D-017), so this context needs no `useOwnAddress()`.
  const page = await context.newPage()
  await logIn(page, email, ACCOUNT_PASSWORD)
  return { context, page }
}

/**
 * MV-051: `/tili` edits the profile (name, language, time zone) and `/tili/turvallisuus`
 * changes the password, which ends the account's other sessions, lists the sessions and logs
 * out the other devices. Every test registers its own account, so the three browser projects
 * never change the same one.
 */
test.describe('profile and security pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  // Each test registers an account and logs in two or three times.
  test.slow()

  test('edits the name and time zone on /tili', async ({ page, browserName }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'profile')
    await logIn(page, email, ACCOUNT_PASSWORD)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tili ja asetukset')
    const tabs = page.getByRole('navigation', { name: 'Tilin osiot' })
    await expect(tabs.locator('a[aria-current="page"]')).toHaveText('Tili')
    await expect(page.getByLabel('Sähköposti')).toHaveValue(email)
    await expect(page.getByRole('button', { name: 'Vaihda' })).toBeEnabled()
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await waitForForm(page)
    await page.getByLabel(/^Nimi/).fill('Anna Korhonen')
    await page.getByLabel('Aikavyöhyke').selectOption('Europe/Stockholm')
    await page.getByRole('button', { name: 'Tallenna' }).click()
    await expect(page.getByText('Tiedot tallennettu.')).toBeVisible()
    // The header's initials follow the new name.
    await expect(page.getByTestId('account-menu-trigger')).toHaveText('AK')

    await page.reload()
    await expect(page.getByLabel(/^Nimi/)).toHaveValue('Anna Korhonen')
    await expect(page.getByLabel('Aikavyöhyke')).toHaveValue('Europe/Stockholm')
    await expect(page.getByLabel('Kieli')).toHaveValue('fi')
  })

  test('changes the password and logs the other device out', async ({
    page,
    browser,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'password')
    await logIn(page, email, ACCOUNT_PASSWORD, '/tili/turvallisuus')
    const other = await otherDevice(browser, email)

    try {
      await page.reload()
      const rows = page.getByTestId('session-row')
      await expect(rows).toHaveCount(2)
      await expect(rows.first()).toContainText('Tämä laite')
      await expect(rows.first()).toContainText('Aktiivinen')
      await expect(rows.nth(1)).toContainText('Chrome, Windows')
      await expect(page.getByText('Kaksivaiheinen tunnistus — tulossa myöhemmin.')).toBeVisible()
      await expectNoA11yViolations(page)

      const form = page.getByTestId('change-password-form')
      await waitForForm(page)
      await form.getByLabel('Nykyinen salasana', { exact: true }).fill('vaara-salasana-123')
      await form.getByLabel('Uusi salasana', { exact: true }).fill(NEW_PASSWORD)
      await form.getByRole('button', { name: 'Vaihda salasana' }).click()
      await expect(form.getByText('Nykyinen salasana on väärin.')).toBeVisible()

      await form.getByLabel('Nykyinen salasana', { exact: true }).fill(ACCOUNT_PASSWORD)
      await form.getByRole('button', { name: 'Vaihda salasana' }).click()
      await expect(
        form.getByText('Salasana vaihdettu. Muut laitteet on kirjattu ulos.'),
      ).toBeVisible()
      await expect(rows).toHaveCount(1)
      await expect(page.getByText('Muita kirjautuneita laitteita ei ole.')).toBeVisible()

      // The other device's session is gone: its next page asks it to log in.
      await other.page.goto('/tili')
      await expect(other.page).toHaveURL(/\/kirjaudu\?next=%2Ftili$/)

      // This device is still signed in, and only the new password works from now on.
      await page.goto('/tili')
      await expect(page).toHaveURL('/tili')
      await logOut(page)
      await page.goto('/kirjaudu')
      await waitForForm(page)
      await page.getByLabel('Sähköposti').fill(email)
      await page.getByLabel('Salasana', { exact: true }).fill(ACCOUNT_PASSWORD)
      await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
      await expect(page.getByTestId('login-denied')).toBeVisible()
      await logIn(page, email, NEW_PASSWORD)
    } finally {
      await other.context.close()
    }
  })

  test('"Kirjaa ulos muista laitteista" ends the other sessions only', async ({
    page,
    browser,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'sessions')
    await logIn(page, email, ACCOUNT_PASSWORD, '/tili/turvallisuus')
    const other = await otherDevice(browser, email)

    try {
      await page.reload()
      const rows = page.getByTestId('session-row')
      await expect(rows).toHaveCount(2)
      const button = page.getByRole('button', { name: 'Kirjaa ulos muista laitteista' })
      await expect(button).toHaveAttribute('data-hydrated', '')
      await button.click()
      await expect(page.getByText('Muut istunnot kirjattu ulos.')).toBeVisible()
      await expect(rows).toHaveCount(1)

      await other.page.goto('/tili/turvallisuus')
      await expect(other.page).toHaveURL(/\/kirjaudu\?next=/)
      await page.reload()
      await expect(page).toHaveURL('/tili/turvallisuus')
    } finally {
      await other.context.close()
    }
  })
})
