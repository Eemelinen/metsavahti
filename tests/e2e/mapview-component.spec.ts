import type { Page } from '@playwright/test'

import { ACCOUNT_PASSWORD, adminApi, markVerified } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { E2E_WATCH_AREA, expect, test } from './fixtures'

/**
 * A verified account of this test's own with one watch area (the seeded one's centre and
 * radius), signed in, on `/vahtialueet`. Not the shared e2e user, whose areas other specs may
 * change. The account comes from the admin REST API: registration is not under test here.
 */
async function openOwnWatchAreas(page: Page, projectName: string) {
  const email = `map-${projectName}-${Date.now()}@metsavahti.test`
  const { api } = await adminApi()
  try {
    const created = await api.post('/api/users', { data: { email, password: ACCOUNT_PASSWORD } })
    expect(created.ok(), await created.text()).toBeTruthy()
  } finally {
    await api.dispose()
  }
  await markVerified(email)
  // The REST login also sets the session cookie of the browser context.
  const login = await page.request.post('/api/users/login', {
    data: { email, password: ACCOUNT_PASSWORD },
  })
  expect(login.ok(), await login.text()).toBeTruthy()
  const { token } = (await login.json()) as { token: string }
  const area = await page.request.post('/api/watch-areas', {
    headers: { authorization: `JWT ${token}` },
    data: { ...E2E_WATCH_AREA },
  })
  expect(area.ok(), await area.text()).toBeTruthy()
  await page.goto('/vahtialueet')
  return page.getByTestId('map-view')
}

/**
 * MV-060: the `MapView` component on `/vahtialueet` of an account with one 800 m watch area.
 * The base map comes from `MAP_TILE_URL`, which `.env.test` points at the WFS mock's fixed
 * tiles, so the visual baseline never depends on OpenStreetMap; the mock answers WMS `GetMap`
 * with a blank tile.
 */
test.describe('MapView', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('loads the configured tiles and offers keyboard-operable controls', async ({
    page,
  }, testInfo) => {
    const cspViolations: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) cspViolations.push(message.text())
    })
    const baseTile = page.waitForResponse((r) => /:3200\/tiles\/\d+\/\d+\/\d+\.png$/.test(r.url()))

    const map = await openOwnWatchAreas(page, testInfo.project.name)
    expect((await baseTile).status()).toBe(200)
    await expect(map).toHaveAttribute('data-map-ready', 'true')

    await expect(map.getByRole('list', { name: 'Karttaselite' })).toHaveText(
      /Uudistushakkuu\s*Harvennus\s*Muu/,
    )
    await expect(map.getByRole('button', { name: 'Lähennä' })).toBeVisible()
    await expect(map.getByRole('button', { name: 'Loitonna' })).toBeVisible()
    await expect(map.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap')
    await expect(map.locator('.maplibregl-ctrl-attrib')).toContainText(
      'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa',
    )

    // The WMS layer: switched on from the keyboard, its tiles come from the WFS endpoint.
    const recenter = map.getByRole('button', { name: 'Keskitä vahtialueeseen' })
    const wms = map.getByRole('button', { name: 'Metsäkeskuksen karttataso' })
    await recenter.focus()
    await page.keyboard.press('Tab')
    await expect(wms).toBeFocused()
    const wmsTile = page.waitForRequest((r) =>
      /:3200\/ows\/\?SERVICE=WMS&.*REQUEST=GetMap/.test(r.url()),
    )
    await page.keyboard.press('Enter')
    await expect(wms).toHaveAttribute('aria-pressed', 'true')
    await wmsTile

    // Zoom out with the keyboard, then "Keskitä" brings the watch area back.
    const canvas = map.locator('canvas')
    const zoomOut = map.getByRole('button', { name: 'Loitonna' })
    await zoomOut.focus()
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter')
    await expect(map.getByText('Lähennä karttaa nähdäksesi tason')).toBeVisible()
    await recenter.focus()
    await page.keyboard.press('Enter')
    await expect(map.getByText('Lähennä karttaa nähdäksesi tason')).toBeHidden()
    await expect(canvas).toHaveAttribute('aria-label', 'Kartta')

    expect(cspViolations).toEqual([])
    await expectNoA11yViolations(page)
  })

  test.describe('visual snapshot', () => {
    test.use({ reducedMotion: 'reduce' })

    test('the map matches its baseline on the fixed style @visual', async ({ page }, testInfo) => {
      const map = await openOwnWatchAreas(page, testInfo.project.name)
      await expect(map).toHaveAttribute('data-map-ready', 'true')
      await page.evaluate(() => document.fonts.ready)
      await expect(map).toHaveScreenshot('mapview.png')
    })
  })
})
