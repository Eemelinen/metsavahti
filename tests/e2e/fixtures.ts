import { type BrowserContext, test as base } from '@playwright/test'

import { CONSENT_COOKIE, createConsent, serializeConsent } from '@/lib/consent/consent-cookie'
import { toWgs84 } from '@/lib/geo/crs'
import { fixtureBbox, loadWfsFixture } from '../helpers/wfs-fixture'

/** Credentials seeded by db.setup.ts; used by auth.setup.ts and the specs. */
export const E2E_USER = {
  email: 'e2e@metsavahti.test',
  password: 'E2e-password-123',
  name: 'E2E Tester',
}

/** `h2` sections of every seeded legal document; the legal pages list them in their TOC (MV-091). */
export const E2E_LEGAL_SECTIONS = [
  { title: 'Rekisterinpitäjä ja yhteystiedot', paragraphs: ['Metsävahti, e2e@metsavahti.test.'] },
  { title: 'Säilytysajat', paragraphs: ['Tilin tiedot säilytetään tilin olemassaolon ajan.'] },
]

const [minE, minN, maxE, maxN] = fixtureBbox(loadWfsFixture())

export const E2E_WATCH_AREA = {
  name: 'E2E vahtialue',
  // Centre of the recorded WFS fixture (tests/fixtures/wfs), in WGS 84.
  center: toWgs84([(minE + maxE) / 2, (minN + maxN) / 2]),
  radiusM: 800,
}

/**
 * Every spec starts with a stored "Vain välttämättömät" choice so the cookie banner (MV-090)
 * never covers what a test clicks; `test.use({ consentChoice: false })` starts without one, as
 * a first visit does (`cookie-consent-banner-and-modal.spec.ts`).
 */
export const test = base.extend<{ consentChoice: boolean }>({
  consentChoice: [true, { option: true }],
  // Playwright's `use` callback, renamed so the React hooks lint rule leaves it alone.
  context: async ({ context, consentChoice }, provide) => {
    if (consentChoice) await addConsentChoice(context)
    await provide(context)
  },
})

/** The same stored choice for a context a spec opens itself with `browser.newContext()`. */
export async function addConsentChoice(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: CONSENT_COOKIE,
      value: encodeURIComponent(serializeConsent(createConsent(false))),
      url: test.info().project.use.baseURL!,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

export { expect } from '@playwright/test'
