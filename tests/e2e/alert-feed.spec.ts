import { signInOwnAccount } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { E2E_WATCH_AREA, expect, test } from './fixtures'
import { runPipeline } from './pipeline'

/**
 * MV-080: `/ilmoitukset` for an account of the test's own. Empty before its first area; after a
 * pipeline run against the mocked WFS it lists the two fixture declarations inside the area as
 * unread "Uusi ilmoitus" items under a date header, and the nav badge counts them. "Näytä
 * kartalla" opens the alert's page (MV-082), which marks it read, "Merkitse kaikki luetuiksi"
 * the rest; the badge follows both without a reload. Owner-only reads and actions are covered by
 * `tests/integration/alert-feed.int.test.ts`.
 */
test.describe('/ilmoitukset', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('lists a pipeline run’s alerts and marks them read @smoke', async ({
    page,
    isMobile,
  }, testInfo) => {
    // A pipeline run (possibly after another project's) and several server renders.
    test.slow()
    const token = await signInOwnAccount(page, `ilmoitukset-${testInfo.project.name}`)
    const nav = page.getByTestId(isMobile ? 'app-nav-tabs' : 'app-nav-sidebar')
    const badge = nav.getByTestId('unread-badge')

    await page.goto('/ilmoitukset')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilmoitukset')
    await expect(page.getByTestId('alert-feed-empty')).toContainText(
      'Ei uusia ilmoituksia — hyvä merkki.',
    )
    await expect(badge).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Merkitse kaikki luetuiksi' })).toHaveCount(0)
    await expectNoA11yViolations(page)

    const name = `Ilmoitusalue ${testInfo.project.name}`
    const created = await page.request.post('/api/watch-areas', {
      headers: { authorization: `JWT ${token}` },
      data: { ...E2E_WATCH_AREA, name },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    await runPipeline(page.request)

    await page.reload()
    const items = page.getByTestId('alert-item')
    const unread = page.locator('[data-testid="alert-item"][data-unread]')
    await expect(items).toHaveCount(2)
    await expect(unread).toHaveCount(2)
    await expect(badge).toHaveText('2 (2 lukematonta)')
    for (const item of await items.all()) {
      await expect(item).toContainText('Uusi ilmoitus')
      await expect(item).toContainText(
        new RegExp(`${name} · [\\d,]+ ha · \\d+ m · klo \\d{2}\\.\\d{2}`),
      )
    }
    await expect(
      page.getByRole('heading', { level: 2, name: /^\d{1,2}\.\d{1,2}\.\d{4}$/ }),
    ).toHaveCount(1)
    await expectNoA11yViolations(page)

    // "Näytä kartalla" opens the alert's own page, which marks it read (MV-082).
    await expect(page.locator('[data-testid="alert-feed"][data-hydrated]')).toBeAttached()
    const first = await items.first().getAttribute('data-alert-id')
    await items
      .first()
      .getByRole('link', { name: /^Näytä kartalla: / })
      .click()
    // The first visit of the map page compiles MapLibre on a cold `next dev`.
    await expect(page).toHaveURL(`/ilmoitukset/${first}`, { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name)
    await expect(badge).toHaveText('1 (1 lukematonta)')

    await nav.getByRole('link', { name: /^Ilmoitukset/ }).click()
    await expect(page).toHaveURL('/ilmoitukset')
    await expect(unread).toHaveCount(1)
    await expect(page.locator('[data-testid="alert-feed"][data-hydrated]')).toBeAttached()
    await page.getByRole('button', { name: 'Merkitse kaikki luetuiksi' }).click()
    await expect(page.getByText('Kaikki ilmoitukset merkitty luetuiksi.')).toBeVisible()
    await expect(unread).toHaveCount(0)
    await expect(items).toHaveCount(2)
    await expect(badge).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Merkitse kaikki luetuiksi' })).toHaveCount(0)

    await page.reload()
    await expect(unread).toHaveCount(0)
    await expect(badge).toHaveCount(0)
  })
})
