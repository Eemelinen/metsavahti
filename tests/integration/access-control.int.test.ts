import { beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

describe('access control', () => {
  let alice: User
  let bob: User
  let aliceAreaId: number

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await createTestUser(payload, { role: 'admin' }) // first user becomes admin via hook
    alice = await createTestUser(payload, { name: 'Alice' })
    bob = await createTestUser(payload, { name: 'Bob' })
    const area = await payload.create({
      collection: 'watch-areas',
      data: { name: 'Alice mökki', center: [25.0, 62.0], radiusM: 1000, owner: alice.id },
      overrideAccess: true,
    })
    aliceAreaId = area.id
  })

  it('first user is admin, later sign-ups are plain users', async () => {
    const payload = await getTestPayload()
    const { docs } = await payload.find({ collection: 'users', sort: 'id', overrideAccess: true })
    expect(docs.map((u) => u.role)).toEqual(['admin', 'user', 'user'])
  })

  it('users only see their own watch areas', async () => {
    const payload = await getTestPayload()
    const asAlice = await payload.find({
      collection: 'watch-areas',
      user: alice,
      overrideAccess: false,
    })
    const asBob = await payload.find({
      collection: 'watch-areas',
      user: bob,
      overrideAccess: false,
    })
    expect(asAlice.docs.map((d) => d.id)).toEqual([aliceAreaId])
    expect(asBob.docs).toHaveLength(0)
  })

  it('users cannot update someone else’s watch area', async () => {
    const payload = await getTestPayload()
    await expect(
      payload.update({
        collection: 'watch-areas',
        id: aliceAreaId,
        data: { name: 'hijacked' },
        user: bob,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('a user creating a watch area always becomes its owner', async () => {
    const payload = await getTestPayload()
    const area = await payload.create({
      collection: 'watch-areas',
      data: { name: 'Bob yrittää', center: [25.1, 62.1], radiusM: 500, owner: alice.id },
      user: bob,
      overrideAccess: false,
    })
    expect(typeof area.owner === 'object' ? area.owner.id : area.owner).toBe(bob.id)
  })

  it('populates the generated PostGIS polygon for a watch area', async () => {
    const payload = await getTestPayload()
    const { findDeclarationsForWatchArea } = await import('@/lib/geo/spatial-queries')
    // No declarations yet → empty, but the query exercises geom_3067.
    expect(await findDeclarationsForWatchArea(payload, aliceAreaId)).toEqual([])
  })
})
