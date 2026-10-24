import { randomUUID } from 'node:crypto'

import { signToken } from '@/lib/tokens'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

/** A genuine `unsub` link for an area that does not exist: the route accepts it, changes nothing. */
async function deadAreaLink(issuedAt = new Date()) {
  const token = await signToken(
    'unsub',
    { sub: '1', jti: randomUUID(), watchAreaId: '999999' },
    30 * 24 * 60 * 60,
    issuedAt,
  )
  return `/api/notifications/unsubscribe?token=${token}`
}

/**
 * MV-073: the unsubscribe link of an alert email lands on the public `/ilmoitukset-lopetettu`
 * page with a login link to the notification settings; a forged link answers 400. The link that
 * actually turns an area off is covered by `tests/integration/alert-emails.int.test.ts`.
 */
test.describe('alert email unsubscribe link', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a genuine link without a live area lands on the expired page @smoke', async ({ page }) => {
    await page.goto(await deadAreaLink())
    await expect(page).toHaveURL('/ilmoitukset-lopetettu?tila=vanhentunut')
    await expect(page.getByTestId('unsubscribe-outcome')).toHaveAttribute(
      'data-state',
      'vanhentunut',
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Linkki ei ole enää voimassa')
    await expect(page.getByText(/Metsänkäyttöilmoitukset-aineistoa/)).toBeVisible()
    await expectNoA11yViolations(page)

    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    await page.goto(await deadAreaLink(old))
    await expect(page).toHaveURL('/ilmoitukset-lopetettu?tila=vanhentunut')
  })

  test('shows the confirmation with a login link to the settings', async ({ page }) => {
    await page.goto('/ilmoitukset-lopetettu?tila=lopetettu')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilmoitukset lopetettu')
    const login = page.getByRole('link', { name: 'Kirjaudu ilmoitusasetuksiin' })
    await expect(login).toHaveAttribute('href', '/kirjaudu?next=%2Ftili%2Filmoitukset')
    await expectNoA11yViolations(page)
  })

  test('answers 400 to a forged link', async ({ request }) => {
    const link = await deadAreaLink()
    const res = await request.get(`${link.slice(0, -2)}xx`, { maxRedirects: 0 })
    expect(res.status()).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_token' })
  })
})
