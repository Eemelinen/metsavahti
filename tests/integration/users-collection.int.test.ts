import { beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'
import { DEFAULT_DAILY_HOUR, DEFAULT_TIMEZONE, isValidTimeZone } from '@/payload/collections/Users'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

/** MV-031: `users` per `01 §3.1` — self-only access, admin-only fields, defaults, auth options. */
describe('users collection', () => {
  let admin: User
  let alice: User
  let bob: User

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    admin = await createTestUser(payload, { role: 'admin' }) // first user becomes admin via hook
    alice = await createTestUser(payload, { name: 'Alice' })
    bob = await createTestUser(payload, { name: 'Bob' })
  })

  it('a user cannot read another user', async () => {
    const payload = await getTestPayload()
    const asAlice = await payload.find({ collection: 'users', user: alice, overrideAccess: false })
    expect(asAlice.docs.map((u) => u.id)).toEqual([alice.id])

    const filtered = await payload.find({
      collection: 'users',
      where: { id: { equals: bob.id } },
      user: alice,
      overrideAccess: false,
    })
    expect(filtered.docs).toHaveLength(0)

    await expect(
      payload.findByID({ collection: 'users', id: bob.id, user: alice, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('an admin can read every user', async () => {
    const payload = await getTestPayload()
    const { docs } = await payload.find({
      collection: 'users',
      sort: 'id',
      user: admin,
      overrideAccess: false,
    })
    expect(docs.map((u) => u.id)).toEqual([admin.id, alice.id, bob.id])
    const bobDoc = await payload.findByID({
      collection: 'users',
      id: bob.id,
      user: admin,
      overrideAccess: false,
    })
    expect(bobDoc.email).toBe(bob.email)
  })

  it('a user can update themselves but not another user', async () => {
    const payload = await getTestPayload()
    const updated = await payload.update({
      collection: 'users',
      id: alice.id,
      data: { name: 'Alice Aho', locale: 'en', timezone: 'Europe/Stockholm' },
      user: alice,
      overrideAccess: false,
    })
    expect(updated).toMatchObject({ name: 'Alice Aho', locale: 'en', timezone: 'Europe/Stockholm' })

    await expect(
      payload.update({
        collection: 'users',
        id: bob.id,
        data: { name: 'hijacked' },
        user: alice,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const bobDoc = await payload.findByID({ collection: 'users', id: bob.id, overrideAccess: true })
    expect(bobDoc.name).toBe('Bob')
  })

  it('a user cannot change role, plan or deletedAt (admin-only fields)', async () => {
    const payload = await getTestPayload()
    const updated = await payload.update({
      collection: 'users',
      id: bob.id,
      data: { role: 'admin', plan: 'free', deletedAt: new Date().toISOString() },
      user: bob,
      overrideAccess: false,
    })
    expect(updated.role).toBe('user')
    expect(updated.deletedAt ?? null).toBeNull()

    const byAdmin = await payload.update({
      collection: 'users',
      id: bob.id,
      data: { deletedAt: '2026-09-20T12:00:00.000Z' },
      user: admin,
      overrideAccess: false,
    })
    expect(byAdmin.deletedAt).toBe('2026-09-20T12:00:00.000Z')
    await payload.update({
      collection: 'users',
      id: bob.id,
      data: { deletedAt: null },
      user: admin,
      overrideAccess: false,
    })
  })

  it('new accounts get the 01 §3.1 defaults', async () => {
    const payload = await getTestPayload()
    const user = await payload.create({
      collection: 'users',
      // `role` is the only required field (the hook forces it to `user` for public sign-ups).
      data: {
        email: `defaults-${Date.now()}@metsavahti.test`,
        password: 'Test-password-123',
        role: 'user',
      },
      overrideAccess: false,
    })
    expect(user).toMatchObject({
      role: 'user',
      locale: 'fi',
      timezone: DEFAULT_TIMEZONE,
      marketingConsent: false,
      notificationPrefs: { enabled: true, mode: 'immediate', dailyHour: DEFAULT_DAILY_HOUR },
      plan: 'free',
    })
    expect(user.marketingConsentAt ?? null).toBeNull()
    expect(user.deletedAt ?? null).toBeNull()
    expect(user._verified ?? false).toBe(false)
  })

  it('marketingConsentAt follows marketingConsent and cannot be set directly', async () => {
    const payload = await getTestPayload()
    const before = Date.now()
    const granted = await payload.update({
      collection: 'users',
      id: alice.id,
      data: { marketingConsent: true, marketingConsentAt: '2000-01-01T00:00:00.000Z' },
      user: alice,
      overrideAccess: false,
    })
    expect(granted.marketingConsent).toBe(true)
    expect(Date.parse(granted.marketingConsentAt!)).toBeGreaterThanOrEqual(before - 1000)

    const unchanged = await payload.update({
      collection: 'users',
      id: alice.id,
      data: { name: 'Alice', marketingConsentAt: null },
      user: alice,
      overrideAccess: false,
    })
    expect(unchanged.marketingConsentAt).toBe(granted.marketingConsentAt)

    const withdrawn = await payload.update({
      collection: 'users',
      id: alice.id,
      data: { marketingConsent: false },
      user: alice,
      overrideAccess: false,
    })
    expect(withdrawn.marketingConsentAt ?? null).toBeNull()
  })

  it('timezone must be an IANA zone name', async () => {
    const payload = await getTestPayload()
    expect(isValidTimeZone('Europe/Helsinki')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    await expect(
      payload.update({
        collection: 'users',
        id: alice.id,
        data: { timezone: 'Mars/Olympus_Mons' },
        user: alice,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('auth options match the ticket', async () => {
    const payload = await getTestPayload()
    const { auth } = payload.collections.users.config
    expect(auth.verify).toBeTruthy()
    expect(auth.maxLoginAttempts).toBe(5)
    expect(auth.lockTime).toBe(10 * 60 * 1000)
    expect(auth.useSessions).toBe(true)
    expect(auth.forgotPassword?.expiration).toBe(60 * 60 * 1000)
  })
})
