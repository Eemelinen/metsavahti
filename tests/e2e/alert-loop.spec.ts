import { mailpit, signInOwnAccount } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { E2E_WATCH_AREA, expect, test } from './fixtures'
import { runPipeline } from './pipeline'

/**
 * MV-082: the whole loop for an account of the test's own. It signs in, draws a watch area over
 * the recorded WFS fixture and triggers the pipeline (`POST /api/jobs/run`, the mocked WFS):
 * the feed lists the two fixture declarations, the alert email in Mailpit links each alert's
 * `/ilmoitukset/[id]`, and that link opens the alert page: the facts of the snapshot, the map
 * zoomed to the polygon, the explainer, "Avaa vahtialue" and Metsäkeskus' map service. Viewing
 * the page marks the alert read, and the badge follows. Owner-only reads and "Tiedot
 * päivittyneet" are covered by `tests/integration/alert-detail.int.test.ts`.
 */
test.describe('alert loop', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('area → pipeline → feed → email → alert page @smoke', async ({
    page,
    isMobile,
  }, testInfo) => {
    // A pipeline run (possibly after another project's), an email and a cold map page.
    test.slow()
    const token = await signInOwnAccount(page, `ilmoitus-${testInfo.project.name}`)
    const me = await page.request.get('/api/users/me', {
      headers: { authorization: `JWT ${token}` },
    })
    const { user } = (await me.json()) as { user: { email: string } }
    const nav = page.getByTestId(isMobile ? 'app-nav-tabs' : 'app-nav-sidebar')
    const badge = nav.getByTestId('unread-badge')

    const name = `Hälytysalue ${testInfo.project.name}`
    const created = await page.request.post('/api/watch-areas', {
      headers: { authorization: `JWT ${token}` },
      data: { ...E2E_WATCH_AREA, name },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const { doc: area } = (await created.json()) as { doc: { id: number } }
    await runPipeline(page.request)

    await page.goto('/ilmoitukset')
    const items = page.getByTestId('alert-item')
    await expect(items).toHaveCount(2)
    await expect(badge).toHaveText('2 (2 lukematonta)')
    const ids = await Promise.all((await items.all()).map((i) => i.getAttribute('data-alert-id')))

    // One immediate email for the area: two alerts, each with its own link.
    const find = async () =>
      (await mailpit.listMessages()).filter(
        // The subject names the area; the account's verification email does not.
        (m) => m.To[0]?.Address === user.email && m.Subject.includes(name),
      )
    await expect.poll(async () => (await find()).length, { timeout: 30_000 }).toBe(1)
    const message = await mailpit.getMessage((await find())[0]!.ID)
    expect(message.HTML).toContain(name)
    expect(message.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
    const links = [...message.HTML.matchAll(/href="([^"]*\/ilmoitukset\/(\d+))"/g)]
    expect(new Set(links.map((l) => l[2])), message.HTML).toEqual(new Set(ids))

    const [, link, alertId] = links[0]!
    const url = new URL(link!)
    expect(url.origin).toBe(new URL(page.url()).origin)
    await page.goto(url.pathname)
    const detail = page.getByTestId('alert-detail')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      new RegExp(`^[\\d,]+ ha, \\d+ m vahtialueesta ${name}$`),
    )
    const facts = page.getByTestId('alert-attributes')
    await expect(facts).toContainText('Ilmoitus saapunut')
    await expect(facts).toContainText('Hakkuutapa')
    await expect(facts).toContainText('vahtialueen keskipisteestä')
    await expect(facts).toContainText('Ilmoitusnumero')
    await expect(page.getByTestId('alert-updated')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Avaa vahtialue' })).toHaveAttribute(
      'href',
      `/vahtialueet/${area.id}`,
    )
    await expect(page.getByRole('link', { name: /^Metsäkeskuksen karttapalvelu/ })).toHaveAttribute(
      'href',
      /^https:\/\/experience\.arcgis\.com\//,
    )
    await expect(page.getByText(/Metsänkäyttöilmoitukset-aineistoa/)).toBeVisible()

    // The first visit of the map page compiles MapLibre on a cold `next dev`.
    await expect(detail.getByTestId('map-view')).toHaveAttribute('data-map-ready', 'true', {
      timeout: 30_000,
    })
    await expect(detail).toHaveAttribute('data-hydrated', '')
    const explainer = page.getByText('Mitä tämä tarkoittaa?')
    await explainer.click()
    await expect(page.getByText(/Ilmoitus ei velvoita hakkaamaan/)).toBeVisible()

    // Viewing the page marked the alert read; the badge follows without a reload.
    await expect(badge).toHaveText('1 (1 lukematonta)')
    await expectNoA11yViolations(page)

    await page.getByRole('link', { name: '← Ilmoitukset' }).click()
    await expect(page).toHaveURL('/ilmoitukset')
    await expect(page.locator(`[data-alert-id="${alertId}"]`)).not.toHaveAttribute('data-unread')
    await expect(page.locator('[data-testid="alert-item"][data-unread]')).toHaveCount(1)

    // Someone else's alert, or one that does not exist, is a 404.
    const missing = await page.goto('/ilmoitukset/999999')
    expect(missing?.status()).toBe(404)
  })
})
