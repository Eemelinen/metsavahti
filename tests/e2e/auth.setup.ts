import { expect, test as setup } from '@playwright/test'

import { AUTH_STATE } from '../../playwright.config'
import { E2E_USER } from './fixtures'

/** Logs in once via the API and stores the session for the browser projects. */
setup('authenticate', async ({ request }) => {
  const res = await request.post('/api/users/login', {
    data: { email: E2E_USER.email, password: E2E_USER.password },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  await request.storageState({ path: AUTH_STATE })
})
