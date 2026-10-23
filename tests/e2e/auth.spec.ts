import type { Page } from '@playwright/test'

import { AUTH_STATE } from '../../playwright.config'
import {
  ACCOUNT_PASSWORD as PASSWORD,
  adminApi,
  createVerifiedAccount,
  logOut,
  registerAccount,
  resetLinks,
  useOwnAddress,
  verificationLinks,
  waitForForm,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const NEW_PASSWORD = 'kataja-kallio-puro-2027'

async function login(page: Page, email: string, password: string): Promise<void> {
  await waitForForm(page)
  await page.getByLabel('Sähköposti').fill(email)
  await page.getByLabel('Salasana', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Kirjaudu', exact: true }).click()
}

/**
 * Record every CSP violation the page reports: the `securitypolicyviolation` event (collected
 * on `window` from the first script on), the console errors Chromium logs for each block and
 * requests refused with `ERR_BLOCKED_BY_CSP` (MapLibre fetches its tiles from a worker).
 */
async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      consoleErrors.push(message.text())
    }
  })
  page.on('requestfailed', (request) => {
    if (/BLOCKED_BY_CSP/.test(request.failure()?.errorText ?? '')) {
      consoleErrors.push(`blocked ${request.url()}`)
    }
  })
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __cspViolations: string[] }).__cspViolations = seen
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  return async () => [
    ...consoleErrors,
    ...(await page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    )),
  ]
}

/** Resolves once the first OpenStreetMap tile request has finished or failed. */
function firstTileSettled(page: Page): Promise<unknown> {
  const isTile = (request: { url(): string }) =>
    request.url().startsWith('https://tile.openstreetmap.org/')
  return Promise.race([
    page.waitForEvent('requestfinished', { predicate: isTile }),
    page.waitForEvent('requestfailed', { predicate: isTile }),
  ])
}

/**
 * Consolidated E03 suite (MV-046, absorbed MV-049): the whole account journey in one browser
 * (register → verify → login → guest-only pages → logout → reset → login), route protection
 * for guests and unverified sessions, the security headers and a CSP-clean `/` and app page,
 * and axe on every auth page. Chromium and Mobile Chrome only (`playwright.config.ts`); the
 * per-ticket specs keep covering webkit.
 */
test.describe('auth (E03)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('register → verify → login → guest-only redirects → logout → reset → login @smoke', async ({
    page,
    browserName,
  }) => {
    // The whole E03 journey in one test: three times the default 30 s.
    test.slow()
    await useOwnAddress(page)
    const email = await registerAccount(page, browserName, 'journey')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vahvista sähköposti')

    const [verifyLink] = await verificationLinks(email, 1)
    await page.goto(verifyLink!)
    await expect(page.getByTestId('verify-outcome')).toHaveAttribute('data-state', 'verified')

    // A guest asking for an app page is sent to the login and brought back after it.
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/kirjaudu?next=%2Fdashboard')
    await login(page, email, PASSWORD)
    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText(`Kirjautunut: ${email}`)).toBeVisible()

    // Guest-only pages send a signed-in user on; `/kirjaudu` follows a safe `?next=`.
    for (const path of ['/kirjaudu', '/rekisteroidy', '/unohtunut-salasana']) {
      await page.goto(path)
      await expect(page).toHaveURL('/dashboard')
    }
    await page.goto('/kirjaudu?next=%2Fdashboard%3Ftab%3Dalueet')
    await expect(page).toHaveURL('/dashboard?tab=alueet')
    await page.goto('/kirjaudu?next=https%3A%2F%2Fexample.com%2F')
    await expect(page).toHaveURL('/dashboard')

    await logOut(page)
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/kirjaudu?next=%2Fdashboard')

    await page.goto('/unohtunut-salasana')
    await waitForForm(page)
    await page.getByLabel('Sähköposti').fill(email)
    await page.getByRole('button', { name: 'Lähetä ohjeet' }).click()
    await expect(page.getByRole('status')).toContainText('Jos osoite on rekisteröity')
    const [resetLink] = await resetLinks(email, 1)
    await page.goto(resetLink!)
    await waitForForm(page)
    await page.getByLabel('Uusi salasana', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Salasana uudelleen').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Tallenna ja kirjaudu' }).click()
    await expect(page).toHaveURL('/kirjaudu?reset=1')

    await login(page, email, NEW_PASSWORD)
    await expect(page).toHaveURL('/dashboard')
  })

  test('protects every app route for guests, with the full return address', async ({ page }) => {
    for (const path of ['/dashboard', '/tili/turvallisuus', '/vahtialueet/3?tab=ilmoitukset']) {
      await page.goto(path)
      await expect(page).toHaveURL(`/kirjaudu?next=${encodeURIComponent(path)}`)
    }
    // Prefix matching stops at the segment: `/tili-poistettu` is public (404 until MV-07x).
    const response = await page.goto('/tili-poistettu')
    expect(response?.url()).toMatch(/\/tili-poistettu$/)
  })

  test('sends an unverified session from an app page to the verification interstitial', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await createVerifiedAccount(page, browserName, 'unverified-guard')
    await page.goto('/kirjaudu')
    await login(page, email, PASSWORD)
    await expect(page).toHaveURL('/dashboard')

    const { api, patchUser } = await adminApi()
    try {
      await patchUser(email, { _verified: false })
    } finally {
      await api.dispose()
    }
    await page.goto('/dashboard')
    await expect(page).toHaveURL(
      `/vahvista-sahkoposti?email=${encodeURIComponent(email)}&required=1`,
    )
    await expect(page.getByTestId('system-code')).toHaveText('VAHVISTUS')
    // The login stays open to it (guest-only means "no verified session").
    await page.goto('/kirjaudu')
    await expect(page).toHaveURL('/kirjaudu')
  })

  test('sends the security headers with a fresh nonce per request', async ({ request }) => {
    const first = await request.get('/')
    const second = await request.get('/')
    const csp = first.headers()['content-security-policy']
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(second.headers()['content-security-policy']).not.toBe(csp)
    expect(first.headers()['strict-transport-security']).toContain('max-age=63072000')
    expect(first.headers()['x-frame-options']).toBe('DENY')
    expect(first.headers()['x-content-type-options']).toBe('nosniff')
    // Next.js stamps the nonce on its own scripts.
    const nonce = /'nonce-([^']+)'/.exec(csp!)![1]!
    expect(await first.text()).toContain(`nonce="${nonce}"`)
  })

  test('/ renders with no CSP violation', async ({ page }) => {
    const violations = await watchCsp(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await violations()).toEqual([])
  })

  test('axe passes on every auth page', async ({ page }) => {
    const pages: Array<[string, string]> = [
      ['/kirjaudu', 'Kirjaudu'],
      ['/kirjaudu?reset=1', 'Kirjaudu'],
      ['/rekisteroidy', 'Luo tili'],
      ['/unohtunut-salasana', 'Unohtunut salasana'],
      ['/vahvista-sahkoposti?email=axe%40metsavahti.test', 'Vahvista sähköposti'],
      [
        '/vahvista-sahkoposti?email=axe%40metsavahti.test&required=1',
        'Vahvista sähköpostiosoitteesi ensin',
      ],
      ['/vahvista?token=keksitty', 'Linkki on jo käytetty'],
      ['/uusi-salasana?token=keksitty', 'Linkki on vanhentunut tai jo käytetty'],
      ['/kirjauduttu-ulos', 'Olet kirjautunut ulos'],
    ]
    for (const [path, heading] of pages) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
      await expect(page.getByTestId('attribution')).toBeVisible()
      await expectNoA11yViolations(page)
    }
  })
})

test.describe('auth (E03, signed in)', () => {
  test.use({ storageState: AUTH_STATE })

  // `/vahtialueet` (MV-05x) does not exist yet; `/dashboard` is today's watch-area page.
  test('the watch-area page with its map renders with no CSP violation', async ({ page }) => {
    const violations = await watchCsp(page)
    // The first map tile settling (loaded or not: the tile server is on the internet, so only a
    // CSP refusal counts) shows the worker ran; no `networkidle`, MapLibre retries failed tiles.
    const tileSettled = firstTileSettled(page)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vahtialueesi')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await tileSettled
    expect(await violations()).toEqual([])
  })
})
