import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against a production-like server on port 3100 backed by the docker compose
 * `db_test` PostGIS (port 5433) and Mailpit, with the Metsäkeskus WFS replaced by
 * a local mock. Run with `pnpm test:e2e` (loads .env.test).
 *
 * Order: webServers start → `db-setup` project migrates/seeds → `auth-setup`
 * logs in once and stores cookies → browser projects run fully in parallel.
 */
const isCI = Boolean(process.env.CI)
const port = Number(process.env.PORT ?? 3100)
const baseURL = process.env.NEXT_PUBLIC_SERVER_URL ?? `http://localhost:${port}`
const wfsMockPort = Number(process.env.WFS_MOCK_PORT ?? 3200)

export const AUTH_STATE = 'tests/e2e/.auth/user.json'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'fi-FI',
    timezoneId: 'Europe/Helsinki',
  },
  projects: [
    { name: 'db-setup', testMatch: /db\.setup\.ts/ },
    { name: 'auth-setup', testMatch: /auth\.setup\.ts/, dependencies: ['db-setup'] },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['auth-setup'],
      testIgnore: /.*\.setup\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['auth-setup'],
      testIgnore: /.*\.setup\.ts/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      dependencies: ['auth-setup'],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
  webServer: [
    {
      command: `pnpm exec tsx tests/e2e/mocks/wfs-server.ts`,
      url: `http://localhost:${wfsMockPort}/health`,
      reuseExistingServer: !isCI,
      timeout: 30_000,
    },
    {
      // CI runs the production build (pnpm test:e2e:ci builds first); locally the
      // dev server is used so no build step is needed. Both use distDir .next-e2e.
      command: isCI ? `pnpm exec next start -p ${port}` : `pnpm exec next dev -p ${port}`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
