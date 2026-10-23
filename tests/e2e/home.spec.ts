import { expectNoA11yViolations } from './a11y'
import { expect, test } from './fixtures'

test.describe('landing page', () => {
  test('explains the service and shows the Metsäkeskus attribution', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('metsässäsi')
    await expect(page.getByTestId('attribution')).toContainText(
      /Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa \d{2}\/\d{4}/,
    )
    await expect(page.getByRole('link', { name: 'Kirjaudu sisään' })).toBeVisible()
    // Design system: Figtree is loaded through next/font (docs/design/README.md).
    await expect(page.locator('body')).toHaveCSS('font-family', /Figtree/)
  })

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('/')
    await expectNoA11yViolations(page)
  })
})
