import { plans } from '@/config/plans'
import { FAQ } from '@/content/faq'
import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

const attributionPattern =
  /Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa \d{2}\/\d{4}/

/** MV-100: landing page `/`, its FAQ and the SEO surface (`sitemap.xml`, `robots.txt`, metadata). */
test.describe('landing page', () => {
  test('explains the service and leads to sign-up @smoke', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Tiedä, jos naapurimetsääsi ollaan hakkaamassa',
    )
    const main = page.getByRole('main')
    for (const heading of ['Miten se toimii', 'Mitä metsänkäyttöilmoitus on?', 'Usein kysyttyä']) {
      await expect(main.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    }
    await expect(main.getByRole('listitem').filter({ hasText: 'Valitse säde' })).toContainText(
      '100 metristä 5 kilometriin',
    )
    // The illustrative map pairs every harvest colour with a label.
    await expect(main.getByRole('list', { name: 'Esimerkkikartta' })).toContainText(
      'Uudistushakkuu',
    )
    // Trust row: data source, privacy and price, the price taken from the plan limit.
    const trust = main.getByRole('region', { name: 'Luotettavuus' })
    for (const heading of ['Tietolähde', 'Yksityisyys', 'Hinta']) {
      await expect(trust.getByRole('heading', { level: 2, name: heading })).toBeVisible()
    }
    await expect(trust).toContainText(`enintään ${plans.free.maxWatchAreas} vahtialuetta`)
    await expect(page.getByTestId('attribution')).toContainText(attributionPattern)
    // Design system: Figtree is loaded through next/font (docs/design/README.md).
    await expect(page.locator('body')).toHaveCSS('font-family', /Figtree/)

    await main.getByRole('link', { name: 'Miten se toimii' }).click()
    await expect(page).toHaveURL(/#miten$/)

    const ctas = main.getByRole('link', { name: 'Luo vahtialue' })
    await expect(ctas).toHaveCount(2)
    await ctas.first().click()
    await expect(page).toHaveURL('/rekisteroidy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Luo tili')
  })

  test('the FAQ opens and closes each answer', async ({ page }) => {
    await page.goto('/')
    const faq = page.locator('#ukk')
    await expect(faq.locator('summary')).toContainText(FAQ.map((entry) => entry.question))

    const first = faq.locator('details').first()
    const second = faq.locator('details').nth(1)
    await expect(first.getByText(FAQ[0]!.answer)).toBeVisible()
    await expect(second.getByText(FAQ[1]!.answer)).toBeHidden()

    await second.locator('summary').click()
    await expect(second.getByText(FAQ[1]!.answer)).toBeVisible()
    await first.locator('summary').click()
    await expect(first.getByText(FAQ[0]!.answer)).toBeHidden()

    // Keyboard: the summary is focusable and toggles with Enter.
    await second.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(second.getByText(FAQ[1]!.answer)).toBeHidden()
  })

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/')
    await expectNoA11yViolations(page)
  })

  test('carries canonical, Open Graph and structured data', async ({ page, baseURL }) => {
    await page.goto('/')
    const origin = new URL(baseURL!).origin
    // Next.js writes the site root without its trailing slash.
    const home = new RegExp(`^${origin}/?$`)

    await expect(page.locator('html')).toHaveAttribute('lang', 'fi')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', home)
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fi_FI')
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', home)
    const ogImage = `${origin}/og-image.png`
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', ogImage)
    const image = await page.request.get(ogImage)
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
    const data = blocks.map((text) => JSON.parse(text) as { '@type': string })
    expect(data.map((item) => item['@type'])).toEqual(['Organization', 'FAQPage'])
    const faqPage = data[1] as unknown as { mainEntity: Array<{ name: string }> }
    expect(faqPage.mainEntity.map((question) => question.name)).toEqual(
      FAQ.map((entry) => entry.question),
    )
  })

  test('legal and form pages carry their own canonical', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin
    for (const path of ['/tietosuoja', '/tietopyynto', '/yhteystiedot']) {
      await page.goto(path)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${origin}${path}`,
      )
    }
  })

  test('serves sitemap.xml and robots.txt', async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    const xml = await sitemap.text()
    expect(xml).toContain(`<loc>${origin}/</loc>`)
    expect(xml).toContain(`<loc>${origin}/tietosuoja</loc>`)
    expect(xml).not.toContain('/tili')

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(200)
    const text = await robots.text()
    expect(text).toContain('Disallow: /admin')
    expect(text).toContain('Disallow: /tili')
    expect(text).toContain(`Sitemap: ${origin}/sitemap.xml`)
  })
})
