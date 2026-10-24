import type { Page } from '@playwright/test'

import { mailpit, useOwnAddress, waitForForm } from './accounts'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const CONTACT_EMAIL = process.env.CONTACT_EMAIL!
const DPO_EMAIL = process.env.DPO_EMAIL!

/** Mailpit messages to `to` with `subject`, polled until `count` have arrived. */
async function messagesTo(to: string, subject: string | RegExp, count: number) {
  const matching = async () =>
    (await mailpit.listMessages()).filter(
      (m) =>
        m.To.some((r) => r.Address === to) &&
        (typeof subject === 'string' ? m.Subject === subject : subject.test(m.Subject)),
    )
  await expect.poll(async () => (await matching()).length, { timeout: 15_000 }).toBe(count)
  return Promise.all((await matching()).map((m) => mailpit.getMessage(m.ID)))
}

async function consent(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: /tietosuojaselosteen/ }).check()
}

/**
 * MV-095: `/yhteystiedot` and `/tietopyynto` (Yhteystiedot artboard): both pages render with the
 * service addresses, the form switch and the attribution, pass axe, validate in the browser, and a
 * sent form shows the success state while the emails arrive in Mailpit (`ContactReceived` to
 * `CONTACT_EMAIL`; `DataRequestReceived` to `DPO_EMAIL` and the receipt to the requester).
 * Every test posts from its own client address so the per-IP limit never trips.
 */
test.describe('public data-request and contact forms', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('contact form: validates, sends ContactReceived and thanks the visitor @smoke', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const name = `Anna ${browserName} ${Date.now()}`
    const email = `contact-${browserName}-${Date.now()}@metsavahti.test`

    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Yhteystiedot' }).click()
    await expect(page).toHaveURL('/yhteystiedot')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Yhteystiedot')
    await expect(page.getByRole('link', { name: 'Yhteydenotto' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    )
    await expect(page.getByRole('link', { name: DPO_EMAIL })).toBeVisible()
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await waitForForm(page)
    await page.getByRole('button', { name: 'Lähetä viesti' }).click()
    await expect(page.getByText('Anna toimiva sähköpostiosoite.')).toBeVisible()
    await expect(page.getByText('Kirjoita viesti.')).toBeVisible()
    await expect(page.getByText('Suostumus tarvitaan, jotta voimme vastata.')).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByLabel('Nimi').fill(name)
    await page.getByLabel('Sähköposti').fill(email)
    await page
      .getByRole('textbox', { name: 'Viesti', exact: true })
      .fill('Hei! Kysyisin vahtialueen säteestä.')
    await consent(page)
    await page.getByRole('button', { name: 'Lähetä viesti' }).click()

    const sent = page.getByTestId('public-form-sent')
    await expect(sent.getByRole('heading', { name: 'Kiitos viestistäsi' })).toBeVisible()
    await expect(sent).toContainText(email)
    await expectNoA11yViolations(page)

    const [message] = await messagesTo(CONTACT_EMAIL, `Yhteydenotto: ${name}`, 1)
    expect(message!.ReplyTo.map((r) => r.Address)).toEqual([email])
    expect(message!.HTML).toContain('Kysyisin vahtialueen säteestä.')

    await sent.getByRole('button', { name: 'Lähetä toinen viesti' }).click()
    await expect(page.getByLabel('Nimi')).toHaveValue(name)
    await expect(page.getByRole('textbox', { name: 'Viesti', exact: true })).toHaveValue('')
  })

  test('data-request form: sends DataRequestReceived to the DPO and the receipt to the requester', async ({
    page,
    browserName,
  }) => {
    await useOwnAddress(page)
    const email = `data-request-${browserName}-${Date.now()}@metsavahti.test`

    await page.goto('/yhteystiedot')
    await page.getByRole('link', { name: 'Tietopyyntö' }).click()
    await expect(page).toHaveURL('/tietopyynto')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tietopyyntö')
    await expect(page.getByRole('link', { name: 'Tietopyyntö' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('radio', { name: /Tarkastus/ })).toBeChecked()
    await expect(page.getByRole('link', { name: 'Tili → Tietosuoja ja tiedot' })).toHaveAttribute(
      'href',
      '/tili/tietosuoja',
    )
    await expect(page.getByTestId('attribution')).toBeVisible()
    await expectNoA11yViolations(page)

    await waitForForm(page)
    await page.getByLabel('Sähköposti').fill('ei-osoite')
    await page.getByRole('button', { name: 'Lähetä tietopyyntö' }).click()
    await expect(page.getByText('Anna toimiva sähköpostiosoite.')).toBeVisible()

    await page.getByLabel('Sähköposti').fill(email)
    await page.getByRole('radio', { name: /Poisto/ }).check()
    await page
      .getByRole('textbox', { name: 'Viesti', exact: true })
      .fill('Poistakaa tietoni, minulla ei ole tiliä.')
    await consent(page)
    await page.getByRole('button', { name: 'Lähetä tietopyyntö' }).click()

    const sent = page.getByTestId('public-form-sent')
    await expect(sent.getByRole('heading', { name: 'Tietopyyntö vastaanotettu' })).toBeVisible()
    await expect(sent).toContainText(email)

    const [receipt] = await messagesTo(email, 'Tietopyyntösi on vastaanotettu', 1)
    const reference = /TP-[0-9A-F]{8}/.exec(receipt!.HTML)?.[0]
    expect(reference).toBeDefined()
    expect(receipt!.HTML).toContain('Poisto')
    const [internal] = await messagesTo(DPO_EMAIL, `Tietopyyntö ${reference}`, 1)
    expect(internal!.ReplyTo.map((r) => r.Address)).toEqual([email])
    expect(internal!.HTML).toContain('Poistakaa tietoni, minulla ei ole tiliä.')
  })
})
