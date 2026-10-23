import type { Page } from '@playwright/test'

import {
  ACCOUNT_PASSWORD as PASSWORD,
  createVerifiedAccount,
  registerAccount,
  useOwnAddress,
  verificationLinks,
  waitForForm,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const DAY = 24 * 60 * 60
const MAX_LOGIN_ATTEMPTS = 5

async function fillLogin(page: Page, email: string, password: string): Promise<void> {
  await waitForForm(page)
  await page.getByLabel('Sähköposti').fill(email)
  await page.getByLabel('Salasana', { exact: true }).fill(password)
}

/** Click "Kirjaudu" and wait for the Server Action round trip (a POST to the page URL). */
async function submit(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/kirjaudu')),
    page.getByRole('button', { name: 'Kirjaudu', exact: true }).click(),
  ])
  // The form re-enables the button after the round trip; axe must not see it half-transparent.
  await expect(page.getByRole('button', { name: 'Kirjaudu', exact: true })).toBeEnabled()
}

const denied = (page: Page) => page.getByTestId('login-denied')

/** Seconds until the `payload-token` cookie expires, or `null` when there is none. */
async function sessionCookieTtl(page: Page): Promise<number | null> {
  const cookie = (await page.context().cookies()).find((c) => c.name === 'payload-token')
  if (!cookie) return null
  return cookie.expires - Date.now() / 1000
}

/**
 * MV-044: `/kirjaudu` → `/dashboard` → "Kirjaudu ulos" → `/kirjauduttu-ulos` (`@smoke`);
 * `?next=` (same-origin only), remember-me, the invalid / unverified (+ resend) / locked
 * answers and the POST-only logout route. Every test registers its own account so the three
 * browser projects never log in to the same one at once.
 */
test.describe('login and logout', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('logs in through the form, lands on the dashboard and logs out again @smoke', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'login')

    await page.goto('/kirjaudu')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kirjaudu')
    await expect(page.getByRole('link', { name: 'Unohditko salasanan?' })).toHaveAttribute(
      'href',
      '/unohtunut-salasana',
    )
    await expect(page.getByRole('link', { name: 'Luo tili' })).toHaveAttribute(
      'href',
      '/rekisteroidy',
    )
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await fillLogin(page, email, PASSWORD)
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText(`Kirjautunut: ${email}`)).toBeVisible()
    // Without "Muista minut" the session lasts one day.
    const ttl = await sessionCookieTtl(page)
    expect(ttl).toBeGreaterThan(DAY - 120)
    expect(ttl).toBeLessThanOrEqual(DAY)

    await page.getByRole('button', { name: 'Kirjaudu ulos' }).click()
    await expect(page).toHaveURL('/kirjauduttu-ulos')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Olet kirjautunut ulos')
    await expect(page.getByRole('link', { name: 'Kirjaudu takaisin' })).toHaveAttribute(
      'href',
      '/kirjaudu',
    )
    await expect(page.getByRole('link', { name: 'Etusivulle' })).toHaveAttribute('href', '/')
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)
    expect(await sessionCookieTtl(page)).toBeNull()

    // The session is gone on the server too, not just the cookie.
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/kirjaudu?next=%2Fdashboard')
  })

  test('remember-me keeps the session for 30 days and ?next= is honoured for same-origin paths only', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'remember')

    // An off-site target falls back to the app home.
    await page.goto('/kirjaudu?next=https%3A%2F%2Fexample.com%2F')
    await fillLogin(page, email, PASSWORD)
    await page.getByLabel('Muista minut').check()
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
    await expect(page).toHaveURL('/dashboard')
    const ttl = await sessionCookieTtl(page)
    expect(ttl).toBeGreaterThan(30 * DAY - 120)
    expect(ttl).toBeLessThanOrEqual(30 * DAY)

    // The token still works after a logout elsewhere ended a different session: log out here.
    await page.getByRole('button', { name: 'Kirjaudu ulos' }).click()
    await expect(page).toHaveURL('/kirjauduttu-ulos')

    // A same-origin path is followed (the dashboard is the only app page today).
    await page.goto('/kirjaudu?next=%2Fdashboard%3Ftab%3Dalueet')
    await fillLogin(page, email, PASSWORD)
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
    await expect(page).toHaveURL('/dashboard?tab=alueet')
  })

  test('refuses bad credentials without saying which part was wrong', async ({ page }) => {
    await useOwnAddress(page)
    await page.goto('/kirjaudu')
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
    await expect(page.getByText('Anna kelvollinen sähköpostiosoite')).toBeVisible()
    await expect(page.getByText('Salasana puuttuu')).toBeVisible()

    await fillLogin(page, 'nobody@metsavahti.test', 'wrong-password-2026')
    await submit(page)
    await expect(denied(page)).toHaveAttribute('data-status', 'invalid')
    await expect(denied(page)).toHaveText('Kirjautuminen epäonnistui. Tarkista tunnus ja salasana.')
    await expectNoA11yViolations(page)
  })

  test('an unverified account is told so and can resend the link from the form', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await registerAccount(page, browserName, 'unverified')
    await verificationLinks(email, 1)

    await page.goto('/kirjaudu')
    // The wrong password is "invalid" even for an unverified account: nothing is revealed.
    await fillLogin(page, email, 'wrong-password-2026')
    await submit(page)
    await expect(denied(page)).toHaveAttribute('data-status', 'invalid')

    await page.getByLabel('Salasana', { exact: true }).fill(PASSWORD)
    await submit(page)
    await expect(denied(page)).toHaveAttribute('data-status', 'unverified')
    await expect(denied(page)).toHaveText('Sähköpostiosoitetta ei ole vielä vahvistettu.')
    await expectNoA11yViolations(page)

    await page.getByRole('button', { name: 'Lähetä vahvistuslinkki uudelleen' }).click()
    await expect(page.getByRole('status')).toHaveText('Vahvistuslinkki lähetetty uudelleen.')
    const [fresh, first] = await verificationLinks(email, 2)
    expect(fresh).not.toBe(first)
    await expect(page).toHaveURL('/kirjaudu')
  })

  test('locks the account after five wrong passwords', async ({ page, browserName }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'locked')
    await page.goto('/kirjaudu')
    await fillLogin(page, email, 'wrong-password-2026')
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i += 1) {
      await submit(page)
      await expect(denied(page)).toHaveAttribute('data-status', 'invalid')
    }
    // Even the right password is refused while the lock lasts.
    await page.getByLabel('Salasana', { exact: true }).fill(PASSWORD)
    await submit(page)
    await expect(denied(page)).toHaveAttribute('data-status', 'locked')
    await expect(denied(page)).toContainText('Tili on lukittu')
    await expectNoA11yViolations(page)
  })

  test('the logout route is POST only and safe for a guest', async ({ page }) => {
    const get = await page.request.get('/kirjaudu-ulos', { maxRedirects: 0 })
    expect(get.status()).toBe(405)
    const post = await page.request.post('/kirjaudu-ulos', { maxRedirects: 0 })
    expect(post.status()).toBe(303)
    expect(post.headers()['location']).toMatch(/\/kirjauduttu-ulos$/)
  })
})
