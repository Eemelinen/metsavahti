import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { ValidationError } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'
import { plans } from '@/config/plans'
import { MAX_RADIUS_M, MIN_RADIUS_M } from '@/payload/collections/WatchAreas'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const HELSINKI: [number, number] = [24.94, 60.17]

/** A 400 `ValidationError` whose `owner` field error carries the plan-limit message. */
const isPlanLimitError = (error: unknown): boolean =>
  error instanceof ValidationError &&
  error.data.errors.some(
    (e) => e.path === 'owner' && /enintään 2 vahtialuetta/.test(String(e.message)),
  )

async function geomStats(id: number) {
  const payload = await getTestPayload()
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<{ area: string | null; wkb: string | null; srid: number }>(sql`
    SELECT ST_Area("geom_3067") AS area, ST_AsHEXEWKB("geom_3067") AS wkb, ST_SRID("geom_3067") AS srid
    FROM "watch_areas" WHERE "id" = ${id}
  `)
  const row = rows[0]
  if (!row) throw new Error(`watch area ${id} not found`)
  return row
}

/**
 * MV-032: `watch_areas` per `01 §3.2` — the generated `geom_3067` column (D-003, ledger D1),
 * the renamed/added fields (ledger D4), the 100–5 000 m radius and the plan limit.
 */
describe('watch-areas collection + geometry column', () => {
  let alice: User
  let bob: User
  let admin: User

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    admin = await createTestUser(payload, { role: 'admin' }) // first user becomes admin via hook
    alice = await createTestUser(payload, { name: 'Alice' })
    bob = await createTestUser(payload, { name: 'Bob' })
  })

  it('insert fills geom_3067 with a polygon of area ≈ πr² (±2 %)', async () => {
    const payload = await getTestPayload()
    const radiusM = 1500
    const area = await payload.create({
      collection: 'watch-areas',
      data: { name: 'Alice mökki', center: HELSINKI, radiusM, owner: alice.id },
      user: alice,
      overrideAccess: false,
    })
    const stats = await geomStats(area.id)
    expect(stats.wkb).not.toBeNull()
    expect(stats.srid).toBe(3067)
    const expected = Math.PI * radiusM * radiusM
    expect(Number(stats.area)).toBeGreaterThan(expected * 0.98)
    expect(Number(stats.area)).toBeLessThan(expected * 1.02)
  })

  it('updating the radius changes the geometry', async () => {
    const payload = await getTestPayload()
    const { docs } = await payload.find({
      collection: 'watch-areas',
      user: alice,
      overrideAccess: false,
    })
    const area = docs[0]!
    const before = await geomStats(area.id)
    await payload.update({
      collection: 'watch-areas',
      id: area.id,
      data: { radiusM: 500 },
      user: alice,
      overrideAccess: false,
    })
    const after = await geomStats(area.id)
    expect(after.wkb).not.toBe(before.wkb)
    expect(Number(after.area)).toBeLessThan(Number(before.area) / 8)
    expect(Number(after.area)).toBeGreaterThan(Math.PI * 500 * 500 * 0.98)
  })

  it('exposes the 01 §3.2 fields with their defaults', async () => {
    const payload = await getTestPayload()
    const area = await payload.create({
      collection: 'watch-areas',
      data: {
        name: 'Bob metsä',
        center: [25.0, 62.0],
        radiusM: 1000,
        addressLabel: 'Jyväskylä',
        owner: bob.id,
      },
      user: bob,
      overrideAccess: false,
    })
    expect(area).toMatchObject({ notificationsEnabled: true, addressLabel: 'Jyväskylä' })
    expect(area.lastCheckedAt ?? null).toBeNull()
    expect(area.lastDeclarationCount ?? null).toBeNull()
    expect('notifyByEmail' in area).toBe(false)
    const { rows } = await ((await getTestPayload()).db as unknown as PostgresAdapter).drizzle
      .execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'watch_areas' AND column_name IN ('notify_by_email', 'notifications_enabled')
    `)
    expect(rows.map((r) => r.column_name)).toEqual(['notifications_enabled'])
  })

  it('rejects radii outside 100–5 000 m', async () => {
    const payload = await getTestPayload()
    expect(MIN_RADIUS_M).toBe(100)
    expect(MAX_RADIUS_M).toBe(5000)
    for (const radiusM of [MIN_RADIUS_M - 1, MAX_RADIUS_M + 1]) {
      await expect(
        payload.create({
          collection: 'watch-areas',
          data: { name: 'Väärä säde', center: HELSINKI, radiusM, owner: bob.id },
          user: bob,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    }
  })

  it('rejects the 3rd watch area on the free plan (config/plans.ts)', async () => {
    const payload = await getTestPayload()
    expect(plans.free.maxWatchAreas).toBe(2)
    const second = await payload.create({
      collection: 'watch-areas',
      data: { name: 'Alice toinen', center: [26.0, 63.0], radiusM: 800, owner: alice.id },
      user: alice,
      overrideAccess: false,
    })
    expect(second.id).toBeTruthy()

    await expect(
      payload.create({
        collection: 'watch-areas',
        data: { name: 'Alice kolmas', center: [27.0, 64.0], radiusM: 800, owner: alice.id },
        user: alice,
        overrideAccess: false,
      }),
    ).rejects.toSatisfy(isPlanLimitError)
    // The limit belongs to the owner, so an admin creating on Alice's behalf hits it too.
    await expect(
      payload.create({
        collection: 'watch-areas',
        data: { name: 'Admin luo Alicelle', center: [27.0, 64.0], radiusM: 800, owner: alice.id },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toSatisfy(isPlanLimitError)
    // Updating an existing area (same owner) is not counted against the limit.
    const renamed = await payload.update({
      collection: 'watch-areas',
      id: second.id,
      data: { name: 'Alice toinen (nimetty)' },
      user: alice,
      overrideAccess: false,
    })
    expect(renamed.name).toBe('Alice toinen (nimetty)')
    // Re-assigning an area to a full owner is rejected as well.
    const bobArea = (
      await payload.find({ collection: 'watch-areas', user: bob, overrideAccess: false })
    ).docs[0]!
    await expect(
      payload.update({
        collection: 'watch-areas',
        id: bobArea.id,
        data: { owner: alice.id },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toSatisfy(isPlanLimitError)
    const count = await payload.count({
      collection: 'watch-areas',
      where: { owner: { equals: alice.id } },
      overrideAccess: true,
    })
    expect(count.totalDocs).toBe(2)
  })
})
