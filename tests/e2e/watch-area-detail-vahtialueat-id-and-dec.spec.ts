import { randomInt } from 'node:crypto'

import type { Page } from '@playwright/test'

import { toWgs84 } from '@/lib/geo/crs'
import { insertDeclaration } from '../helpers/db'
import { assertTestDatabaseUrl } from '../helpers/db-guard'
import { adminApi, signInOwnAccount } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

/** A 100 m square with its south-west corner at (e, n), EPSG:3067. */
function square(e: number, n: number): string {
  return `POLYGON((${e} ${n}, ${e + 100} ${n}, ${e + 100} ${n + 100}, ${e} ${n + 100}, ${e} ${n}))`
}

/**
 * A watch area of the signed-in account with three declarations of its own, on a spot no
 * other test uses (the three browser projects run at once): a regeneration felling with an
 * unread alert, a thinning and a special felling, received on different days.
 */
async function seedArea(page: Page, token: string) {
  const databaseUrl = assertTestDatabaseUrl(process.env.DATABASE_URL)
  // West of 400000, so never on the seeded declaration near Jyväskylä (435000, 6900000).
  const e = 300_000 + randomInt(100) * 1_000
  const n = 6_800_000 + randomInt(300) * 1_000
  const tag = `detail.${e}.${n}.${Date.now()}`
  const avohakkuu = await insertDeclaration(databaseUrl, `${tag}.1`, {
    cuttingTypeCode: 5,
    areaHa: 2.4,
    receivedAt: '2026-10-20T09:00:00.000Z',
    wkt: square(e, n),
  })
  await insertDeclaration(databaseUrl, `${tag}.2`, {
    cuttingTypeCode: 3,
    areaHa: 1.2,
    receivedAt: '2026-09-10T09:00:00.000Z',
    wkt: square(e + 150, n),
  })
  await insertDeclaration(databaseUrl, `${tag}.3`, {
    cuttingTypeCode: 11,
    areaHa: 0.6,
    receivedAt: '2026-08-01T09:00:00.000Z',
    wkt: square(e, n + 150),
  })

  const created = await page.request.post('/api/watch-areas', {
    headers: { authorization: `JWT ${token}` },
    data: { name: 'Mökki', center: toWgs84([e + 50, n + 50]), radiusM: 400 },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const { doc: area } = (await created.json()) as { doc: { id: number; owner: number } }

  const { api } = await adminApi()
  try {
    const alert = await api.post('/api/alerts', {
      data: {
        user: area.owner,
        watchArea: area.id,
        declaration: avohakkuu,
        changeType: 'new',
        snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 2.4, distanceM: 0, receivedAt: null },
      },
    })
    expect(alert.ok(), await alert.text()).toBeTruthy()
  } finally {
    await api.dispose()
  }
  return area.id
}

/**
 * The endpoint as the page's own scripts would call it: a same-origin `fetch`, which carries
 * the session cookie and `Sec-Fetch-Site` (Payload ignores the cookie on non-browser requests).
 */
function fetchGeojson(page: Page, areaId: number) {
  return page.evaluate(async (url) => {
    const res = await fetch(url)
    return { status: res.status, type: res.headers.get('content-type'), body: await res.json() }
  }, `/api/watch-areas/${areaId}/declarations.geojson`)
}

/** The cutting types of the listed rows, top to bottom. */
const rowTypes = (page: Page) => page.getByTestId('declaration-row').locator('strong')

/**
 * MV-067: `/vahtialueet/[id]` for an account of the test's own. The list filters by type,
 * "Vain uudet" and received date through the URL, a row opens its attributes and the
 * disclaimer, and "Poista" asks before deleting the area and returning to `/vahtialueet`.
 * The endpoint's 403 for another account is covered by the integration test.
 */
test.describe('/vahtialueet/[id]', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('sends a guest to the login', async ({ page }) => {
    await page.goto('/vahtialueet/1')
    await expect(page).toHaveURL('/kirjaudu?next=%2Fvahtialueet%2F1')
  })

  test('filters the declarations and opens a row', async ({ page }, testInfo) => {
    // A server render per filter step on a cold `next dev`.
    test.slow()
    const token = await signInOwnAccount(page, `vahtialue-${testInfo.project.name}`)
    const areaId = await seedArea(page, token)

    await page.goto(`/vahtialueet/${areaId}`)
    const geojson = await fetchGeojson(page, areaId)
    expect(geojson.status).toBe(200)
    expect(geojson.type).toBe('application/geo+json')
    expect(
      (geojson.body as { features: Array<{ properties: { isNew: boolean } }> }).features.map(
        (f) => f.properties.isNew,
      ),
    ).toEqual([true, false, false])
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mökki')
    await expect(page.getByText('Säde 400 m · ei vielä tarkistettu')).toBeVisible()
    await expect(page.getByTestId('map-view')).toBeVisible()
    await expect(page.locator('[data-testid="watch-area-detail"][data-hydrated]')).toBeAttached()
    const count = page.getByTestId('declaration-count')
    await expect(count).toHaveText('3 ilmoitusta · 1 uutta')
    await expect(rowTypes(page)).toHaveText(['Avohakkuu', 'Harvennushakkuu', 'Erityishakkuu'])
    await expect(page.getByTestId('declaration-row').first()).toContainText('Uusi')
    await expect(page.getByTestId('declaration-row').first()).toContainText(
      '2,4 ha · 0 m · saapunut 20.10.2026',
    )
    await expect(page.getByRole('link', { name: 'Muokkaa' })).toHaveAttribute(
      'href',
      `/vahtialueet/${areaId}/muokkaa`,
    )
    await expect(page.getByRole('link', { name: 'Ilmoitusasetukset' })).toHaveAttribute(
      'href',
      '/tili/ilmoitukset',
    )
    await expectNoA11yViolations(page)

    // Type, then "Vain uudet" on top of it, then every type again.
    const filters = page.getByRole('group', { name: 'Suodattimet' })
    await filters.getByRole('button', { name: 'Harvennus' }).click()
    await expect(page).toHaveURL(`/vahtialueet/${areaId}?tyyppi=harvennus`)
    await expect(rowTypes(page)).toHaveText(['Harvennushakkuu'])
    await expect(filters.getByRole('button', { name: 'Harvennus' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await filters.getByRole('button', { name: 'Vain uudet' }).click()
    await expect(page).toHaveURL(`/vahtialueet/${areaId}?tyyppi=harvennus&uudet=1`)
    await expect(page.getByText('Ei ilmoituksia näillä suodattimilla.')).toBeVisible()
    await expect(count).toHaveText('0 ilmoitusta · 1 uutta')
    await filters.getByRole('button', { name: 'Kaikki' }).click()
    await expect(page).toHaveURL(`/vahtialueet/${areaId}?uudet=1`)
    await expect(rowTypes(page)).toHaveText(['Avohakkuu'])
    await filters.getByRole('link', { name: 'Tyhjennä suodattimet' }).click()
    await expect(page).toHaveURL(`/vahtialueet/${areaId}`)
    await expect(rowTypes(page)).toHaveCount(3)

    // The received-date range; the URL alone restores a filtered view.
    await filters.getByLabel('Saapunut alkaen').fill('2026-09-01')
    await expect(page).toHaveURL(`/vahtialueet/${areaId}?alkaen=2026-09-01`)
    await expect(rowTypes(page)).toHaveText(['Avohakkuu', 'Harvennushakkuu'])
    await page.goto(`/vahtialueet/${areaId}?tyyppi=muu&asti=2026-08-31`)
    await expect(rowTypes(page)).toHaveText(['Erityishakkuu'])
    await expect(page.getByLabel('Saapunut viimeistään')).toHaveValue('2026-08-31')
    await expect(page.locator('[data-testid="watch-area-detail"][data-hydrated]')).toBeAttached()

    // A row opens its attributes in Finnish and the disclaimer.
    const row = page.getByTestId('declaration-row').first()
    const toggle = row.getByRole('button', { name: /Erityishakkuu/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(row.getByRole('definition')).toHaveCount(6)
    await expect(row).toContainText('Pinta-ala0,6 ha')
    await expect(row).toContainText('Voimassa1.8.2029 asti (3 vuotta ilmoituspäivästä)')
    await expect(row).toContainText('Ilmoitus on hakkuuaikomus, ei velvoite hakata.')
    await row.getByRole('button', { name: 'Näytä kartalla' }).click()
    await expect(page.getByTestId('declaration-popover')).toContainText('Erityishakkuu')
    await expectNoA11yViolations(page)
  })

  test('deletes the area after asking', async ({ page }, testInfo) => {
    const token = await signInOwnAccount(page, `vahtialue-poisto-${testInfo.project.name}`)
    const areaId = await seedArea(page, token)
    await page.goto(`/vahtialueet/${areaId}`)
    await expect(page.locator('[data-testid="watch-area-detail"][data-hydrated]')).toBeAttached()

    // "Poista" asks first; cancelling keeps the area, confirming deletes it.
    await page.getByRole('button', { name: 'Poista' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Poistetaanko vahtialue?' })
    await expect(dialog).toContainText('”Mökki” ja sen ilmoitushistoria poistetaan.')
    await dialog.getByRole('button', { name: 'Peruuta' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Poista' }).click()
    await dialog.getByRole('button', { name: 'Poista' }).click()
    await expect(page).toHaveURL('/vahtialueet')
    await expect(page.getByTestId('no-watch-areas')).toBeVisible()

    expect((await fetchGeojson(page, areaId)).status).toBe(404)
    const response = await page.goto(`/vahtialueet/${areaId}`)
    expect(response?.status()).toBe(404)
  })
})
