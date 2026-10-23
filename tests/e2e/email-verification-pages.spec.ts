import type { Page } from '@playwright/test'

import {
  ACCOUNT_PASSWORD as PASSWORD,
  adminApi,
  registerAccount as register,
  useOwnAddress,
  verificationLinks,
} from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const HOUR = 60 * 60 * 1000

const outcome = (page: Page) => page.getByTestId('verify-outcome')
const resendButton = (page: Page) => page.getByRole('button', { name: /Lähetä uudelleen/ })

/** MV-043: register → resend → Mailpit link → verified → `/aloita`; expired and used states; the guard. */
test.describe('email verification pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('resends with a cooldown, verifies through the newest link and refuses it afterwards @smoke', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await register(page, browserName, 'verify')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vahvista sähköposti')
    await expect(resendButton(page)).toHaveText('Lähetä uudelleen')
    await expect(page.getByRole('link', { name: 'Vaihda sähköpostiosoite' })).toHaveAttribute(
      'href',
      '/rekisteroidy',
    )

    await resendButton(page).click()
    await expect(page.getByRole('status')).toHaveText('Vahvistuslinkki lähetetty uudelleen.')
    await expect(resendButton(page)).toBeDisabled()
    await expect(resendButton(page)).toHaveText(/^Lähetä uudelleen \(\d+ s\)$/)
    await expectNoA11yViolations(page)

    const [newest, oldest] = await verificationLinks(email, 2)
    expect(newest).not.toBe(oldest)

    // The resend retired the first link.
    await page.goto(oldest!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')

    await page.goto(newest!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'verified')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sähköposti vahvistettu')
    await expect(page.getByRole('link', { name: 'Luo ensimmäinen vahtialue' })).toHaveAttribute(
      'href',
      '/aloita',
    )
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    // The account is active: the login Payload refused before registration now succeeds.
    const login = await page.request.post('/api/users/login', {
      data: { email, password: PASSWORD },
    })
    expect(login.ok(), await login.text()).toBeTruthy()

    // The same link again is "used".
    await page.goto(newest!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linkki on jo käytetty')
    await expect(page.getByRole('link', { name: 'Kirjaudu' })).toHaveAttribute('href', '/kirjaudu')
    await expectNoA11yViolations(page)
  })

  test('a link older than 24 h is expired and the page offers a fresh one', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await register(page, browserName, 'expired')
    const [link] = await verificationLinks(email, 1)
    const { api, patchUser } = await adminApi()
    try {
      await patchUser(email, { verificationSentAt: new Date(Date.now() - 25 * HOUR).toISOString() })
    } finally {
      await api.dispose()
    }

    await page.goto(link!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'expired')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Vahvistuslinkki on vanhentunut',
    )
    await expect(page.getByText(email)).toBeVisible()
    await expectNoA11yViolations(page)

    await resendButton(page).click()
    await expect(page.getByRole('status')).toHaveText('Vahvistuslinkki lähetetty uudelleen.')
    const [fresh] = await verificationLinks(email, 2)
    expect(fresh).not.toBe(link)
    await page.goto(fresh!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'verified')
    // The expired link is gone for good.
    await page.goto(link!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')
  })

  test('a missing or unknown token shows the used state', async ({ page }) => {
    await page.goto('/vahvista')
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')
    await page.goto(`/vahvista?token=${'ab'.repeat(20)}`)
    await expect(outcome(page)).toHaveAttribute('data-state', 'invalid')
    await expect(page.getByRole('link', { name: 'Luo tili' })).toHaveAttribute(
      'href',
      '/rekisteroidy',
    )
    await expectNoA11yViolations(page)
  })

  test('a logged-in account that is no longer verified is sent to the interstitial', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = await register(page, browserName, 'guard')
    const [link] = await verificationLinks(email, 1)
    await page.goto(link!)
    await expect(outcome(page)).toHaveAttribute('data-state', 'verified')
    const login = await page.request.post('/api/users/login', {
      data: { email, password: PASSWORD },
    })
    expect(login.ok(), await login.text()).toBeTruthy()
    await page.goto('/dashboard')
    await expect(page.getByText(`Kirjautunut: ${email}`)).toBeVisible()

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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Vahvista sähköpostiosoitteesi ensin',
    )
    await expect(resendButton(page)).toBeEnabled()
    await expect(page.getByRole('link', { name: 'Etusivulle' })).toHaveAttribute('href', '/')
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
