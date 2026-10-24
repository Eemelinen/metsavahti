import { ACCOUNT_PASSWORD, createVerifiedAccount, logIn, mailpit, useOwnAddress } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const EXPORT_SUBJECT = 'Tietojen vienti on valmis'

/**
 * MV-093: `/tili/tietosuoja` shows the consent history that registration wrote, the cookie
 * settings, policy and supervisory-authority links; "Lataa tietoni" queues the export, the
 * `ExportReady` email (Mailpit) carries the signed link, and the link downloads the zip. Every
 * test registers its own account, so the three browser projects never share an export.
 */
test.describe('privacy page and data export', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  // Registers an account, logs in and waits for the export email.
  test.slow()

  test('renders the consent history and delivers the export through the emailed link', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'export')
    await logIn(page, email, ACCOUNT_PASSWORD, '/tili/tietosuoja')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tili ja asetukset')
    const tabs = page.getByRole('navigation', { name: 'Tilin osiot' })
    await expect(tabs.locator('a[aria-current="page"]')).toHaveText('Tietosuoja ja tiedot')

    // Registration accepted the terms and the privacy policy: both are in the history.
    const history = page.getByTestId('consent-history')
    await expect(page.getByRole('heading', { name: 'Suostumushistoria' })).toBeVisible()
    await expect(history.getByTestId('consent-row')).toHaveCount(2)
    await expect(history).toContainText('Käyttöehdot hyväksytty')
    await expect(history).toContainText('Tietosuojaseloste hyväksytty')

    const links = page.getByRole('navigation', { name: 'Tietosuojan linkit' })
    await expect(links.getByRole('link', { name: 'Tietosuojaseloste' })).toHaveAttribute(
      'href',
      '/tietosuoja',
    )
    await expect(
      links.getByRole('link', { name: 'Tietosuojavaltuutetun toimisto ↗' }),
    ).toHaveAttribute('href', 'https://tietosuoja.fi')
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    // The cookie-settings shortcut opens the consent modal.
    const dialog = page.getByRole('dialog', { name: 'Evästeasetukset' })
    await expect(async () => {
      await links.getByRole('button', { name: 'Evästeasetukset' }).click()
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass()
    await dialog.getByRole('button', { name: 'Sulje' }).click()
    await expect(dialog).toBeHidden()

    // "Lataa tietoni" → pending → the email's link → the zip.
    const section = page.getByTestId('data-export')
    await expect(section).toHaveAttribute('data-status', 'none')
    await page.locator('button[data-hydrated]', { hasText: 'Lataa tietoni' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Valmistellaan…' })).toBeVisible()

    const find = async () =>
      (await mailpit.listMessages()).filter(
        (m) => m.To[0]?.Address === email && m.Subject === EXPORT_SUBJECT,
      )
    await expect.poll(async () => (await find()).length, { timeout: 20_000 }).toBe(1)
    const message = await mailpit.getMessage((await find())[0]!.ID)
    expect(message.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
    const link = mailpit.extractFirstLink(message.HTML, '/api/account/export/')
    expect(link).toBeTruthy()
    const { pathname, search } = new URL(link!.replaceAll('&amp;', '&'))

    const response = await page.request.get(`${pathname}${search}`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('application/zip')
    const body = await response.body()
    expect(body.subarray(0, 2).toString('latin1')).toBe('PK')

    // A forged link is refused.
    const forged = await page.request.get(`${pathname}?token=keksitty`)
    expect(forged.status()).toBe(403)

    // Back on the page the export is ready, with its own download link and no new request.
    await page.reload()
    await expect(section).toHaveAttribute('data-status', 'ready')
    await expect(section.getByRole('link', { name: 'Lataa tiedosto (zip)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lataa tietoni' })).toHaveCount(0)
    await expectNoA11yViolations(page)
  })
})
