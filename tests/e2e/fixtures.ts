import { toWgs84 } from '@/lib/geo/crs'
import { fixtureBbox, loadWfsFixture } from '../helpers/wfs-fixture'

/** Credentials seeded by db.setup.ts; used by auth.setup.ts and the specs. */
export const E2E_USER = {
  email: 'e2e@metsavahti.test',
  password: 'E2e-password-123',
  name: 'E2E Tester',
}

const [minE, minN, maxE, maxN] = fixtureBbox(loadWfsFixture())

export const E2E_WATCH_AREA = {
  name: 'E2E vahtialue',
  // Centre of the recorded WFS fixture (tests/fixtures/wfs), in WGS 84.
  center: toWgs84([(minE + maxE) / 2, (minN + maxN) / 2]),
  radiusM: 800,
}

export { expect, test } from '@playwright/test'
