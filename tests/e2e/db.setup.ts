import { expect, test as setup } from '@playwright/test'

import {
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENT_TITLES,
  PLACEHOLDER_VERSION,
  richTextFromSections,
} from '@/lib/legal/documents'
import { insertDeclaration, runMigrations, truncateAll } from '../helpers/db'
import { assertTestDatabaseUrl } from '../helpers/db-guard'
import { createMailpitClient } from '../helpers/mailpit'
import { E2E_LEGAL_SECTIONS, E2E_USER, E2E_WATCH_AREA } from './fixtures'

/**
 * Prepares the e2e database through the running app:
 *  1. guard against non-test databases, 2. migrate, 3. truncate,
 *  4. seed the first user (auto-verified admin), one watch area, one sent but unread alert
 *     (the nav badge, MV-050; its declaration through SQL) and the four placeholder legal
 *     documents (registration records their versions; the legal pages render their
 *     `E2E_LEGAL_SECTIONS`, MV-091) via the REST API.
 * Runs once per `playwright test` invocation (project `db-setup`).
 */
setup('migrate, reset and seed the e2e database', async ({ request }) => {
  const databaseUrl = assertTestDatabaseUrl(process.env.DATABASE_URL)
  runMigrations(databaseUrl)
  await truncateAll(databaseUrl)

  await createMailpitClient(process.env.MAILPIT_API_URL ?? 'http://localhost:8025').deleteAll()

  const first = await request.post('/api/users/first-register', {
    data: { email: E2E_USER.email, password: E2E_USER.password, name: E2E_USER.name },
  })
  expect(first.ok(), await first.text()).toBeTruthy()
  const { token, user } = (await first.json()) as { token: string; user: { id: number } }

  const area = await request.post('/api/watch-areas', {
    headers: { authorization: `JWT ${token}` },
    data: { ...E2E_WATCH_AREA },
  })
  expect(area.ok(), await area.text()).toBeTruthy()
  const { doc: watchArea } = (await area.json()) as { doc: { id: number } }

  // Already emailed (`notifiedAt`), so the dashboard's pending count stays 0; `readAt` unset.
  const alert = await request.post('/api/alerts', {
    headers: { authorization: `JWT ${token}` },
    data: {
      user: user.id,
      watchArea: watchArea.id,
      declaration: await insertDeclaration(databaseUrl, 'e2e.forestusedeclaration.1'),
      changeType: 'new',
      notifiedAt: new Date().toISOString(),
      snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 1.5, distanceM: 120, receivedAt: null },
    },
  })
  expect(alert.ok(), await alert.text()).toBeTruthy()

  for (const slug of LEGAL_DOCUMENT_SLUGS) {
    const title = LEGAL_DOCUMENT_TITLES[slug]
    const doc = await request.post('/api/legal-documents', {
      headers: { authorization: `JWT ${token}` },
      data: {
        slug,
        title,
        version: PLACEHOLDER_VERSION,
        publishedAt: new Date().toISOString(),
        body: richTextFromSections([`${title} – luonnos.`], E2E_LEGAL_SECTIONS),
      },
    })
    expect(doc.ok(), await doc.text()).toBeTruthy()
  }
})
