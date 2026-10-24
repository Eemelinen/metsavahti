import { beforeAll, describe, expect, it } from 'vitest'

import { countUnreadAlerts } from '@/lib/alerts/unread'
import type { User } from '@/payload-types'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const SNAPSHOT = { cuttingTypeLabel: 'Avohakkuu', areaHa: 1.5, distanceM: 120, receivedAt: null }

/** MV-050: the nav badge counts the viewer's own alerts with `readAt IS NULL`. */
describe('countUnreadAlerts', () => {
  let admin: User
  let owner: User
  let quiet: User

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    admin = await createTestUser(payload, { role: 'admin' })
    owner = await createTestUser(payload, { role: 'user', name: 'Owner' })
    quiet = await createTestUser(payload, { role: 'user', name: 'Quiet' })

    const declaration = await payload.create({
      collection: 'declarations',
      data: {
        sourceId: 'forestusedeclaration.50',
        declarationNumber: '1-2026-50',
        cuttingTypeCode: 5,
        areaHa: 1.5,
        geomHash: 'g50',
        attrHash: 'a50',
        firstSeenAt: '2026-01-15T10:00:00.000Z',
        lastSeenAt: '2026-01-15T10:00:00.000Z',
      },
      overrideAccess: true,
    })

    const alerts = async (user: User, read: boolean[]) => {
      const area = await payload.create({
        collection: 'watch-areas',
        data: { name: `Alue ${user.id}`, center: [25.75, 62.24], radiusM: 800, owner: user.id },
        overrideAccess: true,
      })
      for (const isRead of read) {
        await payload.create({
          collection: 'alerts',
          data: {
            user: user.id,
            watchArea: area.id,
            declaration: declaration.id,
            changeType: 'new',
            snapshot: SNAPSHOT,
            notifiedAt: '2026-01-15T12:00:00.000Z',
            ...(isRead ? { readAt: '2026-01-16T08:00:00.000Z' } : {}),
          },
          overrideAccess: true,
        })
      }
    }
    await alerts(owner, [false, false, true])
    await alerts(admin, [false])
  })

  it('counts only unread alerts of the user', async () => {
    const payload = await getTestPayload()
    expect(await countUnreadAlerts(payload, owner)).toBe(2)
    expect(await countUnreadAlerts(payload, quiet)).toBe(0)
  })

  it('counts an admin’s own alerts, not every alert the admin may read', async () => {
    const payload = await getTestPayload()
    expect(await countUnreadAlerts(payload, admin)).toBe(1)
  })

  it('drops an alert from the count once the owner marks it read', async () => {
    const payload = await getTestPayload()
    const { docs } = await payload.find({
      collection: 'alerts',
      user: owner,
      overrideAccess: false,
      where: { readAt: { exists: false } },
      limit: 1,
    })
    await payload.update({
      collection: 'alerts',
      id: docs[0]!.id,
      data: { readAt: new Date().toISOString() },
      user: owner,
      overrideAccess: false,
    })
    expect(await countUnreadAlerts(payload, owner)).toBe(1)
  })
})
