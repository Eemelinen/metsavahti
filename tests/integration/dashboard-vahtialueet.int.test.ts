import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import { plans } from '@/config/plans'
import { toWgs84 } from '@/lib/geo/crs'
import { activeDeclarationCounts } from '@/lib/geo/spatial-queries'
import { loadWatchAreaDashboard } from '@/lib/watch-areas/dashboard'
import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const NOW = new Date('2026-10-24T12:00:00.000Z')
/** Centroid of `SQUARE_WKT_3067`: an area there contains the square. */
const SQUARE_CENTER = toWgs84([435050, 6900050])
/** About 50 km north of the square. */
const ELSEWHERE = toWgs84([435050, 6950050])

/**
 * MV-066: what `/vahtialueet` reads (`loadWatchAreaDashboard()`) against a real Payload +
 * PostGIS. Only the account's own areas are listed (also for an admin, whose read access covers
 * every account), each with its declarations in force and its unread alerts, plus the finish
 * time of the latest succeeded `fetch-declarations` run for the status strip.
 */
describe('/vahtialueet dashboard data (MV-066)', () => {
  let admin: User
  let anna: User
  let ben: User
  const ids: Record<string, number> = {}

  async function area(owner: User, name: string, center: [number, number], radiusM = 500) {
    const payload = await getTestPayload()
    const doc = await payload.create({
      collection: 'watch-areas',
      data: { name, center, radiusM, owner: owner.id, addressLabel: `${name}tie 1` },
      overrideAccess: true,
    })
    ids[name] = doc.id
    return doc.id
  }

  async function alert(owner: User, watchArea: number, declaration: number, readAt?: string) {
    const payload = await getTestPayload()
    await payload.create({
      collection: 'alerts',
      data: {
        user: owner.id,
        watchArea,
        declaration,
        changeType: 'new',
        readAt,
        snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 1, distanceM: 0, receivedAt: null },
      },
      overrideAccess: true,
    })
  }

  async function jobRun(
    task: 'fetch-declarations' | 'match-watch-areas',
    status: 'succeeded' | 'failed',
    finishedAt: string,
  ) {
    const payload = await getTestPayload()
    await payload.create({
      collection: 'job-runs',
      data: { task, status, startedAt: finishedAt, finishedAt },
      overrideAccess: true,
    })
  }

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    admin = await createTestUser(payload, { role: 'admin' })
    anna = await createTestUser(payload)
    ben = await createTestUser(payload)

    await area(anna, 'Mökki', SQUARE_CENTER)
    await area(anna, 'Kotitalo', ELSEWHERE, 1000)
    await area(ben, 'Bennin metsä', SQUARE_CENTER)
    await area(admin, 'Ylläpidon alue', ELSEWHERE)

    const inForce = await insertDeclarationRaw(payload, {
      sourceId: 'mv066-in-force',
      receivedAt: '2026-09-01T08:00:00.000Z',
    })
    const removed = await insertDeclarationRaw(payload, {
      sourceId: 'mv066-removed',
      receivedAt: '2026-09-01T08:00:00.000Z',
    })
    const expired = await insertDeclarationRaw(payload, {
      sourceId: 'mv066-expired',
      // Valid for three years from receipt: over before `NOW`.
      receivedAt: '2023-01-01T08:00:00.000Z',
    })
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    await db.execute(sql`UPDATE declarations SET removed_at = now() WHERE id = ${removed}`)

    await alert(anna, ids['Mökki']!, inForce)
    await alert(anna, ids['Mökki']!, expired)
    await alert(anna, ids['Mökki']!, removed, '2026-10-01T08:00:00.000Z')
    await alert(ben, ids['Bennin metsä']!, inForce)
  })

  it("lists only the account's own areas, oldest first", async () => {
    const payload = await getTestPayload()
    const forAnna = await loadWatchAreaDashboard(payload, anna, NOW)
    expect(forAnna.areas.map((a) => a.name)).toEqual(['Mökki', 'Kotitalo'])
    const forBen = await loadWatchAreaDashboard(payload, ben, NOW)
    expect(forBen.areas.map((a) => a.name)).toEqual(['Bennin metsä'])
  })

  it("does not list other accounts' areas to an admin either", async () => {
    const payload = await getTestPayload()
    const forAdmin = await loadWatchAreaDashboard(payload, admin, NOW)
    expect(forAdmin.areas.map((a) => a.name)).toEqual(['Ylläpidon alue'])
  })

  it('counts declarations in force and unread alerts per area', async () => {
    const payload = await getTestPayload()
    const { areas, maxWatchAreas } = await loadWatchAreaDashboard(payload, anna, NOW)
    expect(areas).toEqual([
      expect.objectContaining({
        id: ids['Mökki'],
        addressLabel: 'Mökkitie 1',
        radiusM: 500,
        notificationsEnabled: true,
        lastCheckedAt: null,
        // The removed and the expired declaration intersect too, but are not in force.
        activeCount: 1,
        // The read alert does not count, nor does Ben's alert of the same declaration.
        newCount: 2,
      }),
      expect.objectContaining({ id: ids['Kotitalo'], activeCount: 0, newCount: 0 }),
    ])
    expect(areas[0]!.center[0]).toBeCloseTo(SQUARE_CENTER[0], 6)
    expect(maxWatchAreas).toBe(plans.free.maxWatchAreas)
  })

  it('activeDeclarationCounts() answers every id, also with nothing to count', async () => {
    const payload = await getTestPayload()
    expect(await activeDeclarationCounts(payload, [], NOW)).toEqual(new Map())
    const counts = await activeDeclarationCounts(
      payload,
      [ids['Mökki']!, ids['Bennin metsä']!, ids['Kotitalo']!],
      NOW,
    )
    expect(counts).toEqual(
      new Map([
        [ids['Mökki']!, 1],
        [ids['Bennin metsä']!, 1],
        [ids['Kotitalo']!, 0],
      ]),
    )
  })

  it('dates the status strip from the latest succeeded fetch-declarations run', async () => {
    const payload = await getTestPayload()
    expect((await loadWatchAreaDashboard(payload, anna, NOW)).dataUpdatedAt).toBeNull()

    await jobRun('fetch-declarations', 'succeeded', '2026-10-23T06:10:00.000Z')
    await jobRun('fetch-declarations', 'succeeded', '2026-10-24T06:10:00.000Z')
    await jobRun('fetch-declarations', 'failed', '2026-10-24T18:10:00.000Z')
    await jobRun('match-watch-areas', 'succeeded', '2026-10-24T18:12:00.000Z')

    expect((await loadWatchAreaDashboard(payload, anna, NOW)).dataUpdatedAt).toBe(
      '2026-10-24T06:10:00.000Z',
    )
  })
})
