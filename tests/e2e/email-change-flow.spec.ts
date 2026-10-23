import {
  ACCOUNT_PASSWORD,
  createVerifiedAccount,
  logIn,
  logOut,
  mailpit,
  useOwnAddress,
  waitForForm,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const CONFIRM_SUBJECT = 'Vahvista uusi sähköpostiosoite'
const NOTICE_SUBJECT = 'Sähköpostiosoitteen vaihtoa pyydettiin'

/** The full body of the one message with `subject` sent to `address`, once it has arrived. */
async function messageTo(address: string, subject: string) {
  const find = async () =>
    (await mailpit.listMessages()).filter(
      (m) => m.To[0]?.Address === address && m.Subject === subject,
    )
  await expect.poll(async () => (await find()).length, { timeout: 15_000 }).toBe(1)
  return mailpit.getMessage((await find())[0]!.ID)
}

/**
 * MV-052: "Vaihda" on `/tili` sends the confirmation link to the new address (Mailpit) and the
 * notice to the old one; the link on `/vaihda-sahkoposti/vahvista` makes the new address the
 * login address, and opening it again changes nothing. Every test registers its own account,
 * so the three browser projects never change the same one.
 */
test.describe('email change flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  // Registers an account, logs in twice and waits for two emails.
  test.slow()

  test('changes the login address through the link sent to the new address', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const oldEmail = await createVerifiedAccount(page, browserName, 'email-old')
    const newEmail = oldEmail.replace('email-old', 'email-new')
    await logIn(page, oldEmail, ACCOUNT_PASSWORD)

    const field = page.getByLabel('Sähköposti')
    await waitForForm(page)
    // The current address is refused, an invalid one too.
    await page.getByRole('button', { name: 'Vaihda' }).click()
    await expect(page.getByText('Tämä on jo tilisi osoite.')).toBeVisible()
    await field.fill('ei-osoite@')
    await field.press('Enter')
    await expect(page.getByText('Anna kelvollinen sähköpostiosoite')).toBeVisible()

    await field.fill(newEmail.toUpperCase())
    await page.getByRole('button', { name: 'Vaihda' }).click()
    await expect(
      page.getByText('Lähetimme vahvistuslinkin uuteen osoitteeseen. Linkki on voimassa tunnin.'),
    ).toBeVisible()
    await expect(page.getByText(`Odottaa vahvistusta: ${newEmail}.`)).toBeVisible()
    await expectNoA11yViolations(page)

    // The old address only hears about it; the new one gets the link.
    const notice = await messageTo(oldEmail, NOTICE_SUBJECT)
    expect(notice.HTML).toContain(newEmail)
    expect(notice.HTML).not.toContain('/vaihda-sahkoposti/vahvista')
    const confirm = await messageTo(newEmail, CONFIRM_SUBJECT)
    expect(confirm.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
    const link = mailpit.extractFirstLink(confirm.HTML, '/vaihda-sahkoposti/vahvista?token=')
    expect(link).toBeTruthy()

    // Until the link is opened the old address is still the login address.
    await page.reload()
    await expect(field).toHaveValue(oldEmail)

    const { pathname, search } = new URL(link!)
    await page.goto(`${pathname}${search}`)
    const outcome = page.getByTestId('email-change-outcome')
    await expect(outcome).toHaveAttribute('data-state', 'changed')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sähköpostiosoite vaihdettu')
    await expect(outcome).toContainText(newEmail)
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    // Token reuse rejected: the same link a second time changes nothing.
    await page.goto(`${pathname}${search}`)
    await expect(outcome).toHaveAttribute('data-state', 'invalid')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linkki ei ole voimassa')

    // This device stayed signed in and shows the new address, which is now the login.
    await page.goto('/tili')
    await expect(field).toHaveValue(newEmail)
    await expect(page.getByText('Uusi osoite vahvistetaan sähköpostilla')).toBeVisible()
    await logOut(page)
    await logIn(page, newEmail, ACCOUNT_PASSWORD)
  })

  test('shows the invalid state for a made-up link', async ({ page }) => {
    await page.goto('/vaihda-sahkoposti/vahvista?token=keksitty')
    await expect(page.getByTestId('email-change-outcome')).toHaveAttribute('data-state', 'invalid')
    await expect(page.getByRole('link', { name: 'Tilin asetuksiin' })).toHaveAttribute(
      'href',
      '/tili',
    )
  })
})
