import {
  ACCOUNT_PASSWORD,
  createVerifiedAccount,
  logIn,
  mailpit,
  useOwnAddress,
  waitForForm,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const DELETED_SUBJECT = 'Tilisi on poistettu'

/**
 * MV-094: `/tili/poista` explains what goes and what stays, keeps "Poista tili pysyvästi"
 * disabled until `POISTA` and a password are given, refuses a wrong password, and with the
 * right one deletes the account: `/tili-poistettu`, the `AccountDeleted` email (Mailpit), the
 * session gone and the login refused. Every test registers its own account.
 */
test.describe('delete account page and account deletion', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  // Registers an account, logs in, deletes it and waits for the email.
  test.slow()

  test('renders, validates and deletes the account', async ({ page, browserName }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'delete')
    await logIn(page, email, ACCOUNT_PASSWORD, '/tili/poista')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tili ja asetukset')
    const tabs = page.getByRole('navigation', { name: 'Tilin osiot' })
    await expect(tabs.locator('a[aria-current="page"]')).toHaveText('Poista tili')
    await expect(page.getByRole('heading', { name: 'Poista tili', level: 2 })).toBeVisible()
    const explanation = page.getByTestId('deletion-explanation')
    await expect(explanation).toContainText('Vahtialueet, niiden hälytykset ja ilmoitushistoria')
    await expect(explanation).toContainText('Suostumusmerkinnät')
    await expect(explanation).toContainText('90 päivän kuluttua')
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    // Disabled until POISTA (upper case) and a password are given.
    await waitForForm(page)
    const confirm = page.getByLabel('Kirjoita POISTA vahvistukseksi')
    const password = page.getByLabel('Salasana', { exact: true })
    const submit = page.getByRole('button', { name: 'Poista tili pysyvästi' })
    await expect(submit).toBeDisabled()
    await confirm.fill('poista')
    await password.fill(ACCOUNT_PASSWORD)
    await expect(submit).toBeDisabled()
    await confirm.fill('POISTA')
    await password.fill('')
    await expect(submit).toBeDisabled()

    // A wrong password is refused on the field; the account stays.
    await password.fill('väärä-salasana-123')
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByRole('alert').filter({ hasText: 'Salasana on väärin.' })).toBeVisible()
    await expect(page).toHaveURL('/tili/poista')

    // The right one deletes it.
    await password.fill(ACCOUNT_PASSWORD)
    await submit.click()
    await expect(page).toHaveURL('/tili-poistettu')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tilisi on poistettu')
    await expect(page.getByText('Lähetimme vahvistuksen sähköpostiin.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Etusivulle' })).toHaveAttribute('href', '/')
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    // The goodbye email arrived, with the attribution.
    const find = async () =>
      (await mailpit.listMessages()).filter(
        (m) => m.To[0]?.Address === email && m.Subject === DELETED_SUBJECT,
      )
    await expect.poll(async () => (await find()).length, { timeout: 20_000 }).toBe(1)
    const message = await mailpit.getMessage((await find())[0]!.ID)
    expect(message.HTML).toContain('Tili ja ilmoitushistoria')
    expect(message.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')

    // The session is gone: the account pages send the browser to the login.
    await page.goto('/tili')
    await expect(page).toHaveURL(/\/kirjaudu\?next=/)

    // And the same credentials no longer log in.
    await waitForForm(page)
    await page.getByLabel('Sähköposti').fill(email)
    await page.getByLabel('Salasana', { exact: true }).fill(ACCOUNT_PASSWORD)
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
    await expect(
      page.getByRole('alert').filter({ hasText: 'Kirjautuminen epäonnistui.' }),
    ).toBeVisible()
  })
})
