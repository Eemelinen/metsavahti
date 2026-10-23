import { randomInt } from 'node:crypto'

import type { Page } from '@playwright/test'

import { createMailpitClient } from '../helpers/mailpit'
import { waitForForm } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const PASSWORD = 'kuusi-metsa-jarvi-2026'
/** Passes the browser schema (≥ 10 chars) but not the server's zxcvbn ≥ 3 requirement. */
const WEAK_PASSWORD = 'salasana123'
const RATE_LIMIT_PER_HOUR = 5

/**
 * Give this test its own client address (`2001:db8::/32`, the IPv6 documentation prefix): the
 * `register` action keys its 5/h limit by `clientIp()`, which reads `x-forwarded-for` first,
 * so the three browser projects and reruns against a reused dev server never share a bucket.
 */
async function useOwnAddress(page: Page): Promise<void> {
  const ip = `2001:db8:${randomInt(0x10000).toString(16)}:${randomInt(0x10000).toString(16)}::1`
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': ip })
}

/** Click "Luo tili" and wait for the Server Action round trip (a POST to the page URL). */
async function submit(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/rekisteroidy'),
    ),
    page.getByRole('button', { name: 'Luo tili' }).click(),
  ])
}

async function fillForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Sähköposti').fill(email)
  await page.getByLabel('Salasana', { exact: true }).fill(password)
  await page.getByLabel('Salasana uudelleen').fill(password)
  await page.getByLabel(/Olen lukenut/).check()
}

/** MV-042 `@smoke`: `/rekisteroidy` → account + verification email → `/vahvista-sahkoposti`. */
test.describe('registration', () => {
  // A logged-in session would be sent away by the guest-only guard (MV-046); register as a guest.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('validates the form inline before anything is sent', async ({ page }) => {
    await page.goto('/rekisteroidy')
    await waitForForm(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Luo tili')
    await page.getByRole('button', { name: 'Luo tili' }).click()
    await expect(page.getByText('Anna kelvollinen sähköpostiosoite')).toBeVisible()
    await expect(page.getByText('Salasanan on oltava vähintään 10 merkkiä')).toBeVisible()
    await expect(
      page.getByText('Hyväksy käyttöehdot ja tietosuojaseloste jatkaaksesi'),
    ).toBeVisible()

    await page.getByLabel('Salasana', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Salasana uudelleen').fill('jotain-muuta-2026')
    await page.getByRole('button', { name: 'Luo tili' }).click()
    await expect(page.getByText('Salasanat eivät täsmää.')).toBeVisible()
    await expect(page.getByRole('meter', { name: 'Salasanan vahvuus' })).toHaveAttribute(
      'aria-valuetext',
      /Hyvä|Vahva/,
    )
    await expectNoA11yViolations(page)
  })

  test('registers, sends the verification email and lands on the verify page @smoke', async ({
    page,
    browserName,
  }) => {
    const mailpit = createMailpitClient(process.env.MAILPIT_API_URL ?? 'http://localhost:8025')
    const email = `e2e-${browserName}-${Date.now()}@metsavahti.test`
    const messagesFor = async () =>
      (await mailpit.listMessages()).filter((m) => m.To[0]?.Address === email)

    await useOwnAddress(page)
    await page.goto('/rekisteroidy')
    await waitForForm(page)
    await fillForm(page, email, PASSWORD)
    await page.getByLabel('Saa lähettää palveluun liittyviä uutisia.').check()
    await page.getByRole('button', { name: 'Luo tili' }).click()

    await expect(page).toHaveURL(/\/vahvista-sahkoposti\?email=/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vahvista sähköposti')
    await expect(page.getByText(email)).toBeVisible()
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await expect.poll(async () => (await messagesFor()).length, { timeout: 15_000 }).toBe(1)
    const message = (await messagesFor())[0]!
    expect(message.Subject).toBe('Vahvista sähköpostiosoitteesi')
    const full = await mailpit.getMessage(message.ID)
    expect(mailpit.extractFirstLink(full.HTML, '/vahvista?token=')).toBeTruthy()
    expect(full.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')

    // Registering the same address again is indistinguishable from the first time: the same
    // redirect, no second email, so the form never reveals who has an account.
    await page.goto('/rekisteroidy')
    await waitForForm(page)
    await fillForm(page, email, 'toinen-salasana-2026')
    await page.getByRole('button', { name: 'Luo tili' }).click()
    await expect(page).toHaveURL(/\/vahvista-sahkoposti\?email=/)
    await expect(page.getByText(email)).toBeVisible()

    // Unverified accounts cannot log in yet (Payload `auth.verify`).
    const login = await page.request.post('/api/users/login', {
      data: { email, password: PASSWORD },
    })
    expect(login.ok()).toBe(false)
    // Still one message for the address: the duplicate submission sent nothing.
    expect(await messagesFor()).toHaveLength(1)
  })

  test('refuses the sixth submission from one address within an hour', async ({
    page,
    browserName,
  }) => {
    const email = `limit-${browserName}-${Date.now()}@metsavahti.test`
    await useOwnAddress(page)
    await page.goto('/rekisteroidy')
    await waitForForm(page)
    // A weak password passes the browser schema and is refused by the server, so every
    // submission is a counted call that creates nothing.
    await fillForm(page, email, WEAK_PASSWORD)
    const tooWeak = page.getByText('Salasana on liian heikko', { exact: false })
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
      await submit(page)
      await expect(tooWeak).toBeVisible()
    }
    await submit(page)
    await expect(page.getByRole('alert').filter({ hasText: 'Liikaa pyyntöjä' })).toBeVisible()
    await expect(tooWeak).toBeHidden()
    await expect(page).toHaveURL(/\/rekisteroidy$/)
    await expectNoA11yViolations(page)
  })
})
