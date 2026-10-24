import type { Page } from '@playwright/test'

import { AUTH_STATE } from '../../playwright.config'
import { ACCOUNT_PASSWORD, adminApi, markVerified } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { E2E_WATCH_AREA, expect, test } from './fixtures'

/**
 * A verified account of this test's own, signed in through the REST login (which also sets the
 * browser context's session cookie); returns its JWT for creating areas. Not the shared e2e
 * user: this spec deletes areas and flips switches.
 */
async function signInOwnAccount(page: Page, projectName: string): Promise<string> {
  const email = `vahtialueet-${projectName}-${Date.now()}@metsavahti.test`
  const { api } = await adminApi()
  try {
    const created = await api.post('/api/users', { data: { email, password: ACCOUNT_PASSWORD } })
    expect(created.ok(), await created.text()).toBeTruthy()
  } finally {
    await api.dispose()
  }
  await markVerified(email)
  const login = await page.request.post('/api/users/login', {
    data: { email, password: ACCOUNT_PASSWORD },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
  return ((await login.json()) as { token: string }).token
}

/** `lastCheckedAt` stands in for the pipeline's match, which nothing writes yet (MV-072). */
async function createArea(page: Page, token: string, name: string, lastCheckedAt?: string) {
  const area = await page.request.post('/api/watch-areas', {
    headers: { authorization: `JWT ${token}` },
    data: { ...E2E_WATCH_AREA, name, addressLabel: `${name}, Jyväskylä`, lastCheckedAt },
  })
  expect(area.ok(), await area.text()).toBeTruthy()
}

/**
 * The watch area's alerts with `readAt` unset, read through the REST API as the admin: the one
 * db.setup.ts seeds plus any the pipeline spec (`api.spec.ts`) creates for it in the same run.
 */
async function unreadAlertsOfArea(areaId: string): Promise<number> {
  const { api } = await adminApi()
  try {
    const res = await api.get(
      `/api/alerts?where[watchArea][equals]=${areaId}&where[readAt][exists]=false&limit=1`,
    )
    expect(res.ok(), await res.text()).toBeTruthy()
    return ((await res.json()) as { totalDocs: number }).totalDocs
  } finally {
    await api.dispose()
  }
}

/**
 * MV-066: `/vahtialueet`, the app home. The shared e2e user sees its seeded area with its
 * unread alerts (`@smoke`); an account of the test's own walks the empty state, the plan
 * limit, the e-mail switch and deletion through the kebab.
 */
test.describe('/vahtialueet (anonymous)', () => {
  test('sends a guest to the login, also from the old /dashboard address', async ({ page }) => {
    await page.goto('/vahtialueet')
    await expect(page).toHaveURL('/kirjaudu?next=%2Fvahtialueet')
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/kirjaudu?next=%2Fvahtialueet')
  })
})

test.describe('/vahtialueet (shared e2e user)', () => {
  test.use({ storageState: AUTH_STATE })

  test('lists the seeded area with its unread alert and the overview map @smoke', async ({
    page,
  }) => {
    await page.goto('/vahtialueet')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vahtialueet')
    await expect(page.getByTestId('data-status')).toHaveText(
      /^(Tiedot päivitetty viimeksi .+ \(Metsäkeskus\)|Metsäkeskuksen tietoja ei ole vielä haettu\.)$/,
    )
    const card = page.getByTestId('watch-area-card').filter({ hasText: E2E_WATCH_AREA.name })
    const link = card.getByRole('link', { name: E2E_WATCH_AREA.name })
    await expect(link).toHaveAttribute('href', /^\/vahtialueet\/\d+$/)
    const areaId = (await link.getAttribute('href'))!.split('/').pop()!
    await expect(card).toContainText('Säde 800 m')
    await expect(card).toContainText(/\d+ voimassa/)
    await expect(async () => {
      const unread = await unreadAlertsOfArea(areaId)
      expect(unread).toBeGreaterThan(0)
      await page.reload()
      await expect(card).toContainText(`Uusia: ${unread}`, { timeout: 2_000 })
    }).toPass()
    // No pipeline step writes `lastCheckedAt` yet (MV-072), so the seeded area is unchecked.
    await expect(card).toContainText('Ei vielä tarkistettu')
    await expect(
      card.getByRole('switch', { name: `Sähköposti-ilmoitukset: ${E2E_WATCH_AREA.name}` }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Kaikki vahtialueet' })).toBeVisible()
    await expect(page.getByTestId('map-view')).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Päävalikko' }).first().getByRole('link', {
        name: 'Vahtialueet',
      }),
    ).toHaveAttribute('aria-current', 'page')
    await expectNoA11yViolations(page)
  })
})

test.describe('/vahtialueet (own account)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('empty state, plan limit, e-mail switch and deletion', async ({ page }, testInfo) => {
    // Many steps and four page loads; a cold `next dev` alone can take most of the 30 s.
    test.slow()
    const token = await signInOwnAccount(page, testInfo.project.name)

    await page.goto('/vahtialueet')
    const empty = page.getByTestId('no-watch-areas')
    await expect(empty.getByRole('heading', { name: 'Ei vielä vahtialueita' })).toBeVisible()
    await expect(empty.getByRole('link', { name: 'Luo vahtialue' })).toHaveAttribute(
      'href',
      '/aloita',
    )
    await expect(page.getByRole('link', { name: 'Uusi vahtialue' })).toHaveAttribute(
      'href',
      '/vahtialueet/uusi',
    )
    await expect(page.getByTestId('map-view')).toHaveCount(0)
    await expectNoA11yViolations(page)

    // The free plan's two areas: the button stays, disabled, and says why.
    await createArea(page, token, 'Mökki', '2026-10-24T06:10:00.000Z')
    await createArea(page, token, 'Kotitalo')
    await page.reload()
    await expect(page.getByTestId('watch-area-card')).toHaveCount(2)
    // A click on the switch or the kebab before hydration is lost (webkit under load).
    await expect(page.locator('[data-testid="watch-area-list"][data-hydrated]')).toBeAttached()
    const limited = page.getByRole('button', { name: 'Uusi vahtialue' })
    await expect(limited).toHaveAttribute('aria-disabled', 'true')
    await expect(limited).toHaveAccessibleDescription('Ilmaisella tasolla enintään 2 vahtialuetta')
    // Playwright refuses to click an `aria-disabled` button; focus opens the tooltip as well.
    await limited.focus()
    await expect(page.getByTestId('watch-area-limit')).toHaveText(
      'Ilmaisella tasolla enintään 2 vahtialuetta',
    )
    await expect(page).toHaveURL('/vahtialueet')

    // The e-mail switch saves at once and survives a reload.
    const mokki = page.getByTestId('watch-area-card').filter({ hasText: 'Mökki' })
    const mokkiSwitch = mokki.getByRole('switch', { name: 'Sähköposti-ilmoitukset: Mökki' })
    await expect(mokki).toContainText('Mökki, Jyväskylä · säde 800 m')
    // The account's time zone (Europe/Helsinki, still summer time on 24.10.2026).
    await expect(mokki).toContainText('Tarkistettu 24.10.2026 klo 09.10')
    await expect(page.getByTestId('watch-area-card').filter({ hasText: 'Kotitalo' })).toContainText(
      'Ei vielä tarkistettu',
    )
    await expect(mokkiSwitch).toHaveAttribute('aria-checked', 'true')
    await mokkiSwitch.click()
    await expect(mokkiSwitch).toHaveAttribute('aria-checked', 'false')
    await expect
      .poll(async () => {
        const res = await page.request.get('/api/watch-areas?where[name][equals]=Mökki', {
          headers: { authorization: `JWT ${token}` },
        })
        const { docs } = (await res.json()) as { docs: Array<{ notificationsEnabled: boolean }> }
        return docs[0]?.notificationsEnabled
      })
      .toBe(false)
    await page.reload()
    await expect(mokkiSwitch).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('[data-testid="watch-area-list"][data-hydrated]')).toBeAttached()

    // Kebab → Poista asks first; cancelling keeps the area, confirming deletes it.
    const kotitalo = page.getByTestId('watch-area-card').filter({ hasText: 'Kotitalo' })
    const actions = kotitalo.getByRole('button', { name: 'Lisää toimintoja: Kotitalo' })
    await actions.click()
    await expect(page.getByRole('menuitem', { name: 'Poista' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Muokkaa' })).toHaveAttribute(
      'href',
      /^\/vahtialueet\/\d+\/muokkaa$/,
    )
    await page.getByRole('menuitem', { name: 'Poista' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Poistetaanko vahtialue?' })
    await expect(dialog).toContainText('”Kotitalo” ja sen ilmoitushistoria poistetaan.')
    await dialog.getByRole('button', { name: 'Peruuta' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('watch-area-card')).toHaveCount(2)

    await actions.click()
    await page.getByRole('menuitem', { name: 'Poista' }).click()
    await dialog.getByRole('button', { name: 'Poista' }).click()
    await expect(page.getByText('Vahtialue ”Kotitalo” poistettu.')).toBeVisible()
    await expect(page.getByTestId('watch-area-card')).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Uusi vahtialue' })).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
