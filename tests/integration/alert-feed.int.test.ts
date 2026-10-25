import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { refresh, updateTag } from 'next/cache'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { markAlertRead, markAllAlertsRead } from '@/app/(frontend)/(app)/ilmoitukset/actions'
import { ALERT_FEED_PAGE_SIZE, loadAlertFeed } from '@/lib/alerts/feed'
import { parseAlertFeedQuery } from '@/lib/alerts/feed-query'
import { countUnreadAlerts } from '@/lib/alerts/unread'
import { requireUser } from '@/lib/auth/guards'
import { toWgs84 } from '@/lib/geo/crs'
import { Unauthorized } from '@/lib/errors'
import type { AlertChangeType } from '@/payload/collections/Alerts'
import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

// The actions take the account from the session; here the session is whoever the test says.
vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))

const signIn = (user: User | null) =>
  vi.mocked(requireUser).mockImplementation(async () => {
    if (!user) throw new Unauthorized()
    return user
  })

const CENTER = toWgs84([435050, 6900050])

/**
 * MV-080: what `/ilmoitukset` reads (`loadAlertFeed()`) and its Server Actions against a real
 * Payload + PostGIS. The feed lists only the account's own alerts (an admin too: its read
 * access covers every account), newest first in Finnish-day groups, 50 per page by cursor, with
 * the watch-area filter; `removed` alerts stay hidden while `ALERT_ON_REMOVED` is off (it is
 * off in `.env.test`). `markAlertRead` / `markAllAlertsRead` change only the account's own
 * alerts and refresh the router so the nav badge (`countUnreadAlerts()`) follows, after
 * expiring its cached count (`alerts:<userId>`, MV-083).
 */
describe('/ilmoitukset alert feed and actions (MV-080)', () => {
  let admin: User
  let anna: User
  let ben: User
  let mokki: number
  let kotitalo: number
  let bensArea: number
  let avohakkuu: number
  let harvennus: number
  let unknownCode: number

  async function area(owner: User, name: string) {
    const payload = await getTestPayload()
    const doc = await payload.create({
      collection: 'watch-areas',
      data: { name, center: CENTER, radiusM: 500, owner: owner.id },
      overrideAccess: true,
    })
    return doc.id
  }

  async function alert(
    owner: User,
    watchArea: number,
    declaration: number,
    createdAt: string,
    { changeType = 'new', readAt }: { changeType?: AlertChangeType; readAt?: string } = {},
  ) {
    const payload = await getTestPayload()
    const doc = await payload.create({
      collection: 'alerts',
      data: {
        user: owner.id,
        watchArea,
        declaration,
        changeType,
        readAt,
        snapshot: { cuttingTypeLabel: 'Vanha nimi', areaHa: 2.4, distanceM: 350, receivedAt: null },
      },
      overrideAccess: true,
    })
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    await db.execute(
      sql`UPDATE alerts SET created_at = ${createdAt}::timestamptz WHERE id = ${doc.id}`,
    )
    return doc.id
  }

  async function readAtOf(id: number) {
    const payload = await getTestPayload()
    const doc = await payload.findByID({ collection: 'alerts', id, overrideAccess: true })
    return doc.readAt ?? null
  }

  async function clearAlerts() {
    const payload = await getTestPayload()
    await payload.delete({
      collection: 'alerts',
      where: { id: { exists: true } },
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
    mokki = await area(anna, 'Mökki')
    kotitalo = await area(anna, 'Kotitalo')
    bensArea = await area(ben, 'Bennin metsä')
    avohakkuu = await insertDeclarationRaw(payload, { sourceId: 'mv080-1', cuttingTypeCode: 5 })
    harvennus = await insertDeclarationRaw(payload, { sourceId: 'mv080-2', cuttingTypeCode: 3 })
    unknownCode = await insertDeclarationRaw(payload, { sourceId: 'mv080-3', cuttingTypeCode: 999 })
  })

  beforeEach(async () => {
    vi.mocked(requireUser).mockReset()
    vi.mocked(refresh).mockClear()
    vi.mocked(updateTag).mockClear()
    await clearAlerts()
  })

  it("lists only the account's own visible alerts, newest first, by Finnish day", async () => {
    const payload = await getTestPayload()
    // 23.10. 23.00 and 24.10. 01.30 in Finland (UTC+3): two days, although both are 23.10. UTC.
    const older = await alert(anna, mokki, harvennus, '2026-10-23T20:00:00.000Z', {
      readAt: '2026-10-23T21:00:00.000Z',
    })
    const newer = await alert(anna, kotitalo, avohakkuu, '2026-10-23T22:30:00.000Z', {
      changeType: 'geometry_changed',
    })
    const unknown = await alert(anna, mokki, unknownCode, '2026-10-23T22:00:00.000Z')
    await alert(anna, mokki, avohakkuu, '2026-10-24T06:00:00.000Z', { changeType: 'removed' })
    await alert(ben, bensArea, avohakkuu, '2026-10-24T07:00:00.000Z')

    const feed = await loadAlertFeed(payload, anna, { watchAreaId: null, cursor: null })
    expect(feed.groups.map((g) => [g.day, g.label, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-24', '24.10.2026', [newer, unknown]],
      ['2026-10-23', '23.10.2026', [older]],
    ])
    const [first, second] = feed.groups[0]!.items
    expect(first).toEqual({
      id: newer,
      changeType: 'geometry_changed',
      unread: true,
      watchArea: { id: kotitalo, name: 'Kotitalo' },
      declarationId: avohakkuu,
      cuttingTypeLabel: 'Avohakkuu',
      colourToken: 'uudistus',
      areaHa: 2.4,
      distanceM: 350,
      time: '01.30',
    })
    // A code outside the list keeps the label frozen in the snapshot.
    expect(second).toMatchObject({ cuttingTypeLabel: 'Vanha nimi', colourToken: 'muu' })
    expect(feed.groups[1]!.items[0]).toMatchObject({
      unread: false,
      cuttingTypeLabel: 'Harvennushakkuu',
    })
    expect(feed.unreadCount).toBe(2)
    expect(feed.nextCursor).toBeNull()
    expect(feed.watchAreas).toEqual([
      { id: mokki, name: 'Mökki' },
      { id: kotitalo, name: 'Kotitalo' },
    ])
    // The badge counts what the feed shows: not the hidden removal, not Ben's alert.
    expect(await countUnreadAlerts(payload, anna)).toBe(2)

    const bens = await loadAlertFeed(payload, ben, { watchAreaId: null, cursor: null })
    expect(bens.groups.flatMap((g) => g.items).map((i) => i.watchArea.name)).toEqual([
      'Bennin metsä',
    ])
    const admins = await loadAlertFeed(payload, admin, { watchAreaId: null, cursor: null })
    expect(admins).toEqual({
      groups: [],
      nextCursor: null,
      watchAreas: [],
      watchAreaId: null,
      unreadCount: 0,
    })
    expect(await countUnreadAlerts(payload, admin)).toBe(0)
  })

  it('filters by one of the account’s areas and ignores anyone else’s', async () => {
    const payload = await getTestPayload()
    const atMokki = await alert(anna, mokki, avohakkuu, '2026-10-24T06:00:00.000Z')
    const atKotitalo = await alert(anna, kotitalo, harvennus, '2026-10-24T07:00:00.000Z')

    const filtered = await loadAlertFeed(
      payload,
      anna,
      parseAlertFeedQuery({ alue: String(mokki) }),
    )
    expect(filtered.watchAreaId).toBe(mokki)
    expect(filtered.groups.flatMap((g) => g.items).map((i) => i.id)).toEqual([atMokki])
    expect(filtered.unreadCount).toBe(1)

    const foreign = await loadAlertFeed(
      payload,
      anna,
      parseAlertFeedQuery({ alue: String(bensArea) }),
    )
    expect(foreign.watchAreaId).toBeNull()
    expect(foreign.groups.flatMap((g) => g.items).map((i) => i.id)).toEqual([atKotitalo, atMokki])
  })

  it('pages 50 at a time by cursor, also through alerts of the same instant', async () => {
    const payload = await getTestPayload()
    const ids: number[] = []
    // Every alert of one pipeline run can share a timestamp; the id breaks the tie.
    for (let i = 0; i < ALERT_FEED_PAGE_SIZE + 2; i += 1) {
      ids.push(await alert(anna, mokki, avohakkuu, '2026-10-24T06:00:00.000Z'))
    }
    const newestFirst = [...ids].reverse()

    const first = await loadAlertFeed(payload, anna, parseAlertFeedQuery({}))
    const firstIds = first.groups.flatMap((g) => g.items).map((i) => i.id)
    expect(firstIds).toEqual(newestFirst.slice(0, ALERT_FEED_PAGE_SIZE))
    expect(first.nextCursor).toMatch(/^\d+-\d+$/)
    expect(first.unreadCount).toBe(ALERT_FEED_PAGE_SIZE + 2)

    const second = await loadAlertFeed(
      payload,
      anna,
      parseAlertFeedQuery({ ennen: first.nextCursor! }),
    )
    expect(second.groups.flatMap((g) => g.items).map((i) => i.id)).toEqual(
      newestFirst.slice(ALERT_FEED_PAGE_SIZE),
    )
    expect(second.nextCursor).toBeNull()
  })

  it('markAlertRead marks only the account’s own alert and refreshes the router', async () => {
    const payload = await getTestPayload()
    const annas = await alert(anna, mokki, avohakkuu, '2026-10-24T06:00:00.000Z')
    const bens = await alert(ben, bensArea, avohakkuu, '2026-10-24T06:00:00.000Z')

    signIn(anna)
    const result = await markAlertRead(annas)
    expect(result).toMatchObject({ ok: true, data: { id: annas } })
    const readAt = await readAtOf(annas)
    expect(readAt).not.toBeNull()
    expect(refresh).toHaveBeenCalledTimes(1)
    // The badge's cached count expires too (MV-083).
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(`alerts:${anna.id}`)
    expect(await countUnreadAlerts(payload, anna)).toBe(0)
    // Marking again keeps the first time.
    expect(await markAlertRead(annas)).toEqual({ ok: true, data: { id: annas, readAt } })

    expect(await markAlertRead(bens)).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    signIn(admin)
    expect(await markAlertRead(bens)).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(await readAtOf(bens)).toBeNull()
    expect(await markAlertRead(999_999)).toMatchObject({ ok: false, error: { code: 'not_found' } })
    expect(await markAlertRead('1; DROP')).toMatchObject({ ok: false, error: { code: 'internal' } })
    signIn(null)
    expect(await markAlertRead(bens)).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
    expect(await readAtOf(bens)).toBeNull()
  })

  it('markAllAlertsRead marks the account’s visible unread alerts, of one area when filtered', async () => {
    const payload = await getTestPayload()
    const atMokki = await alert(anna, mokki, avohakkuu, '2026-10-24T06:00:00.000Z')
    const atKotitalo = await alert(anna, kotitalo, harvennus, '2026-10-24T06:00:00.000Z')
    const removed = await alert(anna, mokki, harvennus, '2026-10-24T06:00:00.000Z', {
      changeType: 'removed',
    })
    const bens = await alert(ben, bensArea, avohakkuu, '2026-10-24T06:00:00.000Z')

    signIn(anna)
    expect(await markAllAlertsRead(mokki)).toEqual({ ok: true, data: { count: 1 } })
    expect(await readAtOf(atMokki)).not.toBeNull()
    expect(await readAtOf(atKotitalo)).toBeNull()
    expect(await countUnreadAlerts(payload, anna)).toBe(1)

    expect(await markAllAlertsRead()).toEqual({ ok: true, data: { count: 1 } })
    expect(await readAtOf(atKotitalo)).not.toBeNull()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(vi.mocked(updateTag).mock.calls).toEqual([[`alerts:${anna.id}`], [`alerts:${anna.id}`]])
    expect(await countUnreadAlerts(payload, anna)).toBe(0)
    // Neither the hidden removal nor Ben's alert changed.
    expect(await readAtOf(removed)).toBeNull()
    expect(await readAtOf(bens)).toBeNull()

    // Ben's area as the filter matches none of Anna's alerts; an admin marks only its own.
    expect(await markAllAlertsRead(bensArea)).toEqual({ ok: true, data: { count: 0 } })
    signIn(admin)
    expect(await markAllAlertsRead()).toEqual({ ok: true, data: { count: 0 } })
    expect(await readAtOf(bens)).toBeNull()
    signIn(null)
    expect(await markAllAlertsRead()).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
    expect(await readAtOf(bens)).toBeNull()
  })
})
