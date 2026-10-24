import { AUTH_STATE } from '../../playwright.config'
import { adminApi, createVerifiedAccount, useOwnAddress } from './accounts'
import { addConsentChoice, expect, test } from './fixtures'

/**
 * MV-098: the seeded admin (`AUTH_STATE`) opens a fresh account in the Payload
 * admin, sees its consent history in the "Tietosuoja" panel, triggers its export for a
 * support request, then deletes it through the confirmation modal and lands on the user list.
 * Every browser project registers its own account.
 */
test.describe('admin GDPR tooling', () => {
  test.use({ storageState: AUTH_STATE })
  // Registers an account and compiles the admin panel under `next dev`.
  test.slow()

  test('shows consent history and exports and deletes an account', async ({
    page,
    browser,
    browserName,
  }) => {
    // Register the account in a guest context; the page keeps the admin session.
    const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await addConsentChoice(guest)
    const guestPage = await guest.newPage()
    await useOwnAddress(guestPage)
    const email = await createVerifiedAccount(guestPage, browserName, 'admin-gdpr')
    await guest.close()

    const { api } = await adminApi()
    const userId = async () => {
      const res = await api.get(`/api/users?where[email][equals]=${encodeURIComponent(email)}`)
      expect(res.ok()).toBeTruthy()
      return ((await res.json()) as { docs: Array<{ id: number }> }).docs[0]?.id
    }
    try {
      const id = await userId()
      expect(id).toBeTruthy()

      await page.goto(`/admin/collections/users/${id}`)
      const panel = page.getByTestId('user-gdpr-panel')
      await expect(panel).toBeVisible({ timeout: 30_000 })
      const history = panel.getByRole('table', { name: 'Suostumushistoria' })
      await expect(history.locator('tbody tr')).toHaveCount(2)
      await expect(history).toContainText('Käyttöehdot hyväksytty')
      await expect(history).toContainText('Tietosuojaseloste hyväksytty')
      await expect(panel).toContainText('Ei vientejä.')

      // A click before hydration is lost (webkit under load); wait for the buttons' island.
      await expect(panel.locator('[data-testid="user-gdpr-actions"][data-hydrated]')).toBeAttached()

      // Export for a support request: the link goes to the account, the panel shows it ready.
      await panel.getByRole('button', { name: 'Vie käyttäjän tiedot' }).click()
      await expect(page.getByText('Vienti tehty. Linkki lähetettiin käyttäjälle.')).toBeVisible({
        timeout: 15_000,
      })
      await expect(panel).toContainText('Valmis, linkki lähetetty käyttäjälle')

      // Delete through the confirmation modal; back on the list, the account is gone.
      await panel.getByRole('button', { name: 'Poista käyttäjän tili' }).click()
      await page.getByRole('button', { name: 'Poista pysyvästi' }).click()
      await expect(page).toHaveURL(/\/admin\/collections\/users(\?.*)?$/, { timeout: 15_000 })
      await expect.poll(userId).toBeUndefined()
    } finally {
      await api.dispose()
    }
  })
})
