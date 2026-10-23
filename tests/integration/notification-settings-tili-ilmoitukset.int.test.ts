import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  listWatchAreaNotifications,
  notificationSettingsOf,
  sendTestAlertEmail,
  setMarketingConsent,
  setWatchAreaNotifications,
  testEmailLimiter,
  updateNotificationPrefs,
} from '@/lib/account/notification-settings'
import { PLACEHOLDER_VERSION, seedLegalDocuments } from '@/lib/legal/documents'
import type { User } from '@/payload-types'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const TEST_SUBJECT = 'Metsävahti: testisähköposti'
const CONTEXT = { ip: '203.0.113.77', userAgent: 'Vitest' }

async function readUser(id: number): Promise<User> {
  const payload = await getTestPayload()
  return payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
}

async function marketingEvents(userId: number) {
  const payload = await getTestPayload()
  const { docs } = await payload.find({
    collection: 'consent-events',
    where: { and: [{ user: { equals: userId } }, { kind: { equals: 'marketing' } }] },
    sort: 'createdAt',
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

async function createArea(owner: number, name: string, notificationsEnabled = true) {
  const payload = await getTestPayload()
  return payload.create({
    collection: 'watch-areas',
    data: { name, center: [25.75, 62.24], radiusM: 800, owner, notificationsEnabled },
    overrideAccess: true,
  })
}

/**
 * MV-054: the `/tili/ilmoitukset` settings against a real Payload + Mailpit. The marketing
 * switch writes a consent event for every decision (`granted=false` on untick), the global
 * switch and the mode save without resetting each other, the per-area switch only reaches the
 * account's own areas, and the test email is the alert email with fixture rows, 3 per hour.
 */
describe('notification settings /tili/ilmoitukset (MV-054)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await seedLegalDocuments(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    await createTestUser(payload, { role: 'admin' })
  })

  beforeEach(async () => {
    await testEmailLimiter.reset()
  })

  it('writes a marketing consent event with granted=false when the box is unticked', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)

    await expect(setMarketingConsent(payload, user, true, CONTEXT)).resolves.toEqual({
      changed: true,
    })
    const granted = await readUser(user.id)
    expect(granted.marketingConsent).toBe(true)
    expect(granted.marketingConsentAt).toBeTruthy()

    await expect(setMarketingConsent(payload, granted, false, CONTEXT)).resolves.toEqual({
      changed: true,
    })
    const withdrawn = await readUser(user.id)
    expect(withdrawn.marketingConsent).toBe(false)
    expect(withdrawn.marketingConsentAt).toBeNull()

    const events = await marketingEvents(user.id)
    expect(events.map((e) => e.granted)).toEqual([true, false])
    for (const event of events) {
      expect(event.version).toBe(PLACEHOLDER_VERSION)
      expect(event.ip).toBe('203.0.113.0')
      expect(event.userAgent).toBe('Vitest')
    }

    // The same decision again is not a new event.
    await expect(setMarketingConsent(payload, withdrawn, false, CONTEXT)).resolves.toEqual({
      changed: false,
    })
    expect(await marketingEvents(user.id)).toHaveLength(2)
  })

  it('saves the global switch and the mode without resetting the other', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    expect(notificationSettingsOf(user)).toEqual({
      enabled: true,
      mode: 'immediate',
      dailyHour: 9,
      marketing: false,
    })

    await updateNotificationPrefs(payload, user, { mode: 'weekly' })
    const weekly = await readUser(user.id)
    await expect(updateNotificationPrefs(payload, weekly, { enabled: false })).resolves.toEqual({
      enabled: false,
      mode: 'weekly',
      dailyHour: 9,
      marketing: false,
    })
    expect((await readUser(user.id)).notificationPrefs).toMatchObject({
      enabled: false,
      mode: 'weekly',
      dailyHour: 9,
    })
  })

  it('lists and switches only the account’s own watch areas', async () => {
    const payload = await getTestPayload()
    const owner = await createTestUser(payload)
    const other = await createTestUser(payload)
    const own = await createArea(owner.id, 'Mökki')
    await createArea(owner.id, 'Aho', false)
    const foreign = await createArea(other.id, 'Naapurin metsä')

    expect(await listWatchAreaNotifications(payload, other)).toEqual([
      { id: foreign.id, name: 'Naapurin metsä', addressLabel: null, notificationsEnabled: true },
    ])
    expect(
      (await listWatchAreaNotifications(payload, owner)).map((a) => [
        a.name,
        a.notificationsEnabled,
      ]),
    ).toEqual([
      ['Aho', false],
      ['Mökki', true],
    ])

    await setWatchAreaNotifications(payload, owner, own.id, false)
    expect(
      (await payload.findByID({ collection: 'watch-areas', id: own.id, overrideAccess: true }))
        .notificationsEnabled,
    ).toBe(false)

    // Someone else's area is out of reach and stays as it was.
    await expect(setWatchAreaNotifications(payload, owner, foreign.id, false)).rejects.toThrow()
    expect(
      (await payload.findByID({ collection: 'watch-areas', id: foreign.id, overrideAccess: true }))
        .notificationsEnabled,
    ).toBe(true)
  })

  it('an admin sees only their own areas in the table', async () => {
    const payload = await getTestPayload()
    const admin = await createTestUser(payload, { role: 'admin' })
    await createArea(admin.id, 'Ylläpitäjän alue')
    const rows = await listWatchAreaNotifications(payload, admin)
    expect(rows.map((r) => r.name)).toEqual(['Ylläpitäjän alue'])
  })

  it('sends the sample alert email to the account, at most three times an hour', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)

    await expect(sendTestAlertEmail(payload, user)).resolves.toEqual({
      status: 'sent',
      email: user.email,
    })

    const deadline = Date.now() + 10_000
    let summaries = []
    do {
      summaries = (await mailpit.listMessages()).filter(
        (m) => m.To[0]?.Address === user.email && m.Subject === TEST_SUBJECT,
      )
      if (summaries.length > 0) break
      await new Promise((r) => setTimeout(r, 200))
    } while (Date.now() < deadline)
    expect(summaries).toHaveLength(1)
    const message = await mailpit.getMessage(summaries[0]!.ID)
    expect(message.HTML).toContain('Esimerkkialue')
    expect(message.HTML).toContain('2026-TESTI-0001')
    expect(message.HTML).toContain('Avohakkuu')
    expect(message.HTML).toContain('/tili/ilmoitukset')
    expect(message.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')

    await sendTestAlertEmail(payload, user)
    await sendTestAlertEmail(payload, user)
    const limited = await sendTestAlertEmail(payload, user)
    expect(limited.status).toBe('limited')
    // The limit is per account.
    const other = await createTestUser(payload)
    await expect(sendTestAlertEmail(payload, other)).resolves.toMatchObject({ status: 'sent' })
  })
})
