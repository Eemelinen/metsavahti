import { beforeAll, describe, expect, it } from 'vitest'

import { registerUser } from '@/lib/auth/registration'
import { env } from '@/lib/env'
import { PLACEHOLDER_VERSION, seedLegalDocuments } from '@/lib/legal/documents'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const CONTEXT = { ip: '203.0.113.77', userAgent: 'vitest' }
const PASSWORD = 'kuusi-metsa-jarvi-2026'

/**
 * MV-042: `registerUser()` creates the account, the consent trail and (through Payload's
 * `auth.verify`) the verification email; a duplicate address is a no-op.
 */
describe('registration (MV-042)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await mailpit.deleteAll()
    await seedLegalDocuments(payload)
    // The first account becomes admin (Users hook); registrations must come after it.
    await createTestUser(payload, { role: 'admin' })
  })

  it('creates an unverified user, three consent rows and sends the verify email', async () => {
    const payload = await getTestPayload()
    const email = `anna.k-${Date.now()}@metsavahti.test`
    const outcome = await registerUser(
      payload,
      { email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, marketing: true },
      CONTEXT,
    )
    expect(outcome.status).toBe('created')
    if (outcome.status !== 'created') return

    const user = await payload.findByID({
      collection: 'users',
      id: outcome.user.id,
      overrideAccess: true,
      showHiddenFields: true,
    })
    expect(user).toMatchObject({ email, role: 'user', marketingConsent: true, _verified: false })
    expect(user._verificationToken).toBeTruthy()
    expect(user.marketingConsentAt).toBeTruthy()

    const { docs: consents } = await payload.find({
      collection: 'consent-events',
      where: { user: { equals: user.id } },
      overrideAccess: true,
    })
    // `kind` is a Postgres enum, whose sort order is declaration order; sort here instead.
    const byKind = [...consents].sort((a, b) => a.kind.localeCompare(b.kind))
    expect(byKind.map((c) => [c.kind, c.version, c.granted, c.ip, c.userAgent])).toEqual([
      ['marketing', PLACEHOLDER_VERSION, true, '203.0.113.0', 'vitest'],
      ['privacy', PLACEHOLDER_VERSION, true, '203.0.113.0', 'vitest'],
      ['terms', PLACEHOLDER_VERSION, true, '203.0.113.0', 'vitest'],
    ])

    await mailpit.waitForMessages(1)
    const messages = (await mailpit.listMessages()).filter((m) => m.To[0]?.Address === email)
    expect(messages).toHaveLength(1)
    expect(messages[0]!.Subject).toBe('Vahvista sähköpostiosoitteesi')
    const full = await mailpit.getMessage(messages[0]!.ID)
    const link = mailpit.extractFirstLink(full.HTML, '/vahvista?token=')
    expect(link).toBe(`${env.NEXT_PUBLIC_SERVER_URL}/vahvista?token=${user._verificationToken}`)
    expect(full.HTML).toContain('Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa')
  })

  it('writes only terms + privacy when marketing is not ticked', async () => {
    const payload = await getTestPayload()
    const email = `bertta-${Date.now()}@metsavahti.test`
    const outcome = await registerUser(
      payload,
      { email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, marketing: false },
      { ip: null, userAgent: null },
    )
    expect(outcome.status).toBe('created')
    if (outcome.status !== 'created') return
    expect(outcome.user.marketingConsent).toBe(false)
    const { docs: consents } = await payload.find({
      collection: 'consent-events',
      where: { user: { equals: outcome.user.id } },
      overrideAccess: true,
    })
    expect(consents.map((c) => c.kind).sort()).toEqual(['privacy', 'terms'])
    expect(consents[0]!.ip ?? null).toBeNull()
  })

  it('a duplicate email (any letter case) creates nothing and sends nothing', async () => {
    const payload = await getTestPayload()
    const email = `cecilia-${Date.now()}@metsavahti.test`
    const first = await registerUser(
      payload,
      { email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, marketing: false },
      CONTEXT,
    )
    expect(first.status).toBe('created')
    const before = await mailpit.listMessages()
    const usersBefore = await payload.count({ collection: 'users', overrideAccess: true })
    const consentsBefore = await payload.count({
      collection: 'consent-events',
      overrideAccess: true,
    })

    // The schema lower-cases the address before `registerUser` sees it; the Local API check
    // is on the stored (lower-cased) value.
    const second = await registerUser(
      payload,
      {
        email,
        password: 'toinen-salasana-2026',
        confirmPassword: 'toinen-salasana-2026',
        acceptTerms: true,
        marketing: true,
      },
      CONTEXT,
    )
    expect(second).toEqual({ status: 'duplicate' })
    expect((await payload.count({ collection: 'users', overrideAccess: true })).totalDocs).toBe(
      usersBefore.totalDocs,
    )
    expect(
      (await payload.count({ collection: 'consent-events', overrideAccess: true })).totalDocs,
    ).toBe(consentsBefore.totalDocs)
    await new Promise((r) => setTimeout(r, 300))
    expect((await mailpit.listMessages()).length).toBe(before.length)
  })
})
