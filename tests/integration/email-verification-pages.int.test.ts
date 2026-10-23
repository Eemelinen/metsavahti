import { type MigrateUpArgs, type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import { registerUser } from '@/lib/auth/registration'
import { findUnverifiedSessionUser } from '@/lib/auth/session'
import {
  VERIFICATION_LINK_TTL_MS,
  resendVerificationEmail,
  verifyEmailToken,
} from '@/lib/auth/verification'
import { env } from '@/lib/env'
import { seedLegalDocuments } from '@/lib/legal/documents'
import * as migration from '@/payload/migrations/20260920_180549_users_verification_sent_at'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const CONTEXT = { ip: '203.0.113.77', userAgent: 'vitest' }
const PASSWORD = 'kuusi-metsa-jarvi-2026'
const HOUR = 60 * 60 * 1000

/** Register a pending account and return it with its hidden token. */
async function registerPending(email: string) {
  const payload = await getTestPayload()
  const outcome = await registerUser(
    payload,
    { email, password: PASSWORD, confirmPassword: PASSWORD, acceptTerms: true, marketing: false },
    CONTEXT,
  )
  if (outcome.status !== 'created') throw new Error('registration failed')
  return readUser(outcome.user.id)
}

async function readUser(id: number) {
  const payload = await getTestPayload()
  return payload.findByID({
    collection: 'users',
    id,
    overrideAccess: true,
    showHiddenFields: true,
  })
}

/**
 * MV-043: the three token states of `/vahvista?token=`, the resend helper and the
 * unverified-session guard, against a real Payload + Mailpit.
 */
describe('email verification pages (MV-043)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await mailpit.deleteAll()
    await seedLegalDocuments(payload)
    // The first account becomes admin (Users hook); registrations must come after it.
    await createTestUser(payload, { role: 'admin' })
  })

  it('dates the token at registration and verifies the account once', async () => {
    const payload = await getTestPayload()
    const email = `verify-${Date.now()}@metsavahti.test`
    const user = await registerPending(email)
    expect(user._verified).toBe(false)
    expect(user.verificationSentAt).toBeTruthy()
    expect(Date.now() - Date.parse(user.verificationSentAt!)).toBeLessThan(HOUR)
    const token = user._verificationToken!

    await expect(verifyEmailToken(payload, token)).resolves.toEqual({ state: 'verified', email })
    const verified = await readUser(user.id)
    expect(verified._verified).toBe(true)
    expect(verified._verificationToken ?? null).toBeNull()

    // The same link a second time: Payload dropped the token, so it is "used".
    await expect(verifyEmailToken(payload, token)).resolves.toEqual({ state: 'invalid' })
    // A verified account can log in.
    await expect(
      payload.login({ collection: 'users', data: { email, password: PASSWORD } }),
    ).resolves.toMatchObject({ user: { email } })
  })

  it('refuses a link older than 24 h without touching the account', async () => {
    const payload = await getTestPayload()
    const email = `expired-${Date.now()}@metsavahti.test`
    const user = await registerPending(email)
    const token = user._verificationToken!
    const issued = Date.parse(user.verificationSentAt!)

    // The boundary itself is still valid; one millisecond later is not.
    await expect(
      verifyEmailToken(payload, token, issued + VERIFICATION_LINK_TTL_MS + 1),
    ).resolves.toEqual({ state: 'expired', email })
    const still = await readUser(user.id)
    expect(still._verified).toBe(false)
    expect(still._verificationToken).toBe(token)

    await expect(
      verifyEmailToken(payload, token, issued + VERIFICATION_LINK_TTL_MS),
    ).resolves.toEqual({ state: 'verified', email })
  })

  it('treats a missing, unknown or foreign token as invalid', async () => {
    const payload = await getTestPayload()
    await expect(verifyEmailToken(payload, undefined)).resolves.toEqual({ state: 'invalid' })
    await expect(verifyEmailToken(payload, '')).resolves.toEqual({ state: 'invalid' })
    await expect(verifyEmailToken(payload, 'ff'.repeat(20))).resolves.toEqual({
      state: 'invalid',
    })
    await expect(verifyEmailToken(payload, "' OR 1=1 --")).resolves.toEqual({ state: 'invalid' })
  })

  it('resend issues a fresh dated token, emails it and retires the old link', async () => {
    const payload = await getTestPayload()
    const email = `resend-${Date.now()}@metsavahti.test`
    const user = await registerPending(email)
    const oldToken = user._verificationToken!
    const messagesFor = async () =>
      (await mailpit.listMessages()).filter((m) => m.To[0]?.Address === email)
    await expect.poll(async () => (await messagesFor()).length).toBe(1)

    const later = Date.parse(user.verificationSentAt!) + 2 * HOUR
    await expect(resendVerificationEmail(payload, email, later)).resolves.toEqual({
      status: 'sent',
    })
    const refreshed = await readUser(user.id)
    expect(refreshed._verificationToken).toMatch(/^[0-9a-f]{40}$/)
    expect(refreshed._verificationToken).not.toBe(oldToken)
    expect(Date.parse(refreshed.verificationSentAt!)).toBe(later)
    expect(refreshed._verified).toBe(false)

    await expect.poll(async () => (await messagesFor()).length).toBe(2)
    const [latest] = (await messagesFor()).sort((a, b) => b.Created.localeCompare(a.Created))
    expect(latest!.Subject).toBe('Vahvista sähköpostiosoitteesi')
    const full = await mailpit.getMessage(latest!.ID)
    expect(mailpit.extractFirstLink(full.HTML, '/vahvista?token=')).toBe(
      `${env.NEXT_PUBLIC_SERVER_URL}/vahvista?token=${refreshed._verificationToken}`,
    )
    expect(full.HTML).toContain('Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa')

    await expect(verifyEmailToken(payload, oldToken)).resolves.toEqual({ state: 'invalid' })
    await expect(verifyEmailToken(payload, refreshed._verificationToken!)).resolves.toEqual({
      state: 'verified',
      email,
    })
  })

  it('resend is a silent no-op for unknown and verified addresses', async () => {
    const payload = await getTestPayload()
    const verified = await createTestUser(payload)
    // Payload issues a token on every create, even with `_verified: true`; it must stay untouched.
    const tokenBefore = (await readUser(verified.id))._verificationToken
    const before = (await mailpit.listMessages()).length
    await expect(resendVerificationEmail(payload, verified.email)).resolves.toEqual({
      status: 'skipped',
    })
    await expect(resendVerificationEmail(payload, 'nobody@metsavahti.test')).resolves.toEqual({
      status: 'skipped',
    })
    const after = await readUser(verified.id)
    expect(after._verified).toBe(true)
    expect(after._verificationToken).toBe(tokenBefore)
    expect(after.verificationSentAt ?? null).toBeNull()
    await new Promise((r) => setTimeout(r, 300))
    expect((await mailpit.listMessages()).length).toBe(before)
  })

  it('the session guard sees a logged-in account that lost its verification', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const { token } = await payload.login({
      collection: 'users',
      data: { email: user.email, password: user.password },
    })
    // A direct navigation: Payload's cookie extraction wants `Sec-Fetch-Site` when `csrf` is set.
    const headers = new Headers({ cookie: `payload-token=${token}`, 'sec-fetch-site': 'none' })
    // Verified: the guard stays out of the way; Payload's own strategy accepts the cookie.
    await expect(findUnverifiedSessionUser(payload, headers)).resolves.toBeNull()
    await expect(payload.auth({ headers })).resolves.toMatchObject({ user: { id: user.id } })

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { _verified: false },
      overrideAccess: true,
    })
    // Payload now treats the same cookie as a guest; only the guard can name the account.
    await expect(payload.auth({ headers })).resolves.toMatchObject({ user: null })
    await expect(findUnverifiedSessionUser(payload, headers)).resolves.toMatchObject({
      id: user.id,
      email: user.email,
    })
    await expect(
      findUnverifiedSessionUser(payload, new Headers({ cookie: 'payload-token=nonsense' })),
    ).resolves.toBeNull()
  })

  it('migration round-trip drops and recreates the column (runs last)', async () => {
    const payload = await getTestPayload()
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    const args = { db } as unknown as MigrateUpArgs
    const columns = async () =>
      (
        await db.execute<{ n: number }>(sql`
          SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'verification_sent_at'
        `)
      ).rows[0]!.n

    await migration.down(args)
    expect(await columns()).toBe(0)
    await migration.up(args)
    expect(await columns()).toBe(1)
    const user = await registerPending(`after-migration-${Date.now()}@metsavahti.test`)
    expect(user.verificationSentAt).toBeTruthy()
  })
})
