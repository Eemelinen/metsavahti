import { AUTH_STATE } from '../../playwright.config'
import {
  ACCOUNT_PASSWORD,
  adminApi,
  createVerifiedAccount,
  logOut,
  useOwnAddress,
  waitForForm,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { E2E_USER, expect, test } from './fixtures'

/**
 * MV-050: the `(app)` shell. Desktop projects (chromium, webkit) navigate with the sidebar,
 * Mobile Chrome with the bottom tab bar; the other navigation is hidden on each. The badge
 * counts `E2E_USER`'s unread alerts: the one db.setup.ts seeds plus any the pipeline spec
 * (`api.spec.ts`) creates for the seeded watch area while this runs.
 */

/** `E2E_USER`'s alerts with `readAt` unset, read through the REST API as the admin. */
async function unreadAlertsOfE2eUser(): Promise<number> {
  const { api } = await adminApi()
  try {
    const me = (await (await api.get('/api/users/me')).json()) as { user: { id: number } }
    const res = await api.get(
      `/api/alerts?where[user][equals]=${me.user.id}&where[readAt][exists]=false&limit=1`,
    )
    expect(res.ok(), await res.text()).toBeTruthy()
    return ((await res.json()) as { totalDocs: number }).totalDocs
  } finally {
    await api.dispose()
  }
}

test.describe('app layout (logged in)', () => {
  test.use({ storageState: AUTH_STATE })

  test('navigates between Vahtialueet, Ilmoitukset and Tili with the visible navigation', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/vahtialueet')
    const visible = page.getByTestId(isMobile ? 'app-nav-tabs' : 'app-nav-sidebar')
    const hidden = page.getByTestId(isMobile ? 'app-nav-sidebar' : 'app-nav-tabs')
    await expect(visible).toBeVisible()
    await expect(hidden).toBeHidden()
    await expect(page.getByTestId('attribution')).toBeVisible()

    const current = visible.locator('a[aria-current="page"]')
    await expect(current).toHaveText('Vahtialueet')
    const badge = visible.getByTestId('unread-badge')
    await expect(async () => {
      const unread = await unreadAlertsOfE2eUser()
      expect(unread).toBeGreaterThan(0)
      await page.reload()
      await expect(badge).toBeVisible()
      await expect(badge).toHaveText(`${unread} (${unread} lukematonta)`, { timeout: 2_000 })
    }).toPass()

    await visible.getByRole('link', { name: /^Ilmoitukset/ }).click()
    await expect(page).toHaveURL('/ilmoitukset')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilmoitukset')
    await expect(current).toHaveText(/^Ilmoitukset/)
    await expect(current).toHaveAccessibleName(/^Ilmoitukset \(\d+ lukematonta\)$/)
    await expectNoA11yViolations(page)

    await visible.getByRole('link', { name: 'Tili' }).click()
    await expect(page).toHaveURL('/tili')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tili ja asetukset')
    await expect(current).toHaveText('Tili')

    await visible.getByRole('link', { name: 'Vahtialueet' }).click()
    await expect(page).toHaveURL('/vahtialueet')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vahtialueet')
    await expect(current).toHaveText('Vahtialueet')
  })

  test('the account menu shows the address and links to Tili and Asetukset', async ({ page }) => {
    await page.goto('/vahtialueet')
    const trigger = page.getByRole('button', { name: `Tilivalikko: ${E2E_USER.email}` })
    await expect(trigger).toHaveText('ET')
    await trigger.click()
    const menu = page.getByRole('menu')
    await expect(menu).toContainText(E2E_USER.email)
    await expect(menu.getByRole('menuitem', { name: 'Asetukset' })).toHaveAttribute(
      'href',
      '/tili/ilmoitukset',
    )
    await expectNoA11yViolations(page)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    await trigger.click()
    await page.getByRole('menuitem', { name: 'Tili' }).click()
    await expect(page).toHaveURL('/tili')
  })
})

test.describe('app layout (own account)', () => {
  test('logs out from the account menu and shows no badge without alerts', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'shell')
    await page.goto('/kirjaudu')
    await waitForForm(page)
    await page.getByLabel('Sähköposti').fill(email)
    await page.getByLabel('Salasana', { exact: true }).fill(ACCOUNT_PASSWORD)
    await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
    await expect(page).toHaveURL('/vahtialueet')
    await expect(page.getByTestId('unread-badge')).toHaveCount(0)

    await logOut(page)
    await page.goto('/ilmoitukset')
    await expect(page).toHaveURL('/kirjaudu?next=%2Filmoitukset')
  })
})
