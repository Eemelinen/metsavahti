import type { FeatureCollection, MultiPolygon } from 'geojson'
import type { Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/watch-areas/[id]/declarations.geojson/route'
import { requireUser } from '@/lib/auth/guards'
import { Unauthorized } from '@/lib/errors'
import { toWgs84 } from '@/lib/geo/crs'
import { loadWatchAreaDetail } from '@/lib/watch-areas/detail'
import type { WatchAreaDeclarationProperties } from '@/lib/watch-areas/detail'
import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

// The route takes the account from the session; here the session is whoever the test says.
vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))

/** Centroid of `SQUARE_WKT_3067` (the helper's default declaration geometry). */
const SQUARE_CENTER = toWgs84([435050, 6900050])
/** A second square 200 m east of the first, still inside a 500 m area around the centre. */
const EAST_SQUARE_WKT =
  'POLYGON((435200 6900000, 435300 6900000, 435300 6900100, 435200 6900100, 435200 6900000))'

/**
 * MV-067: `GET /api/watch-areas/[id]/declarations.geojson` gives the owner the area's
 * declarations in WGS 84 with `isNew` from the account's unread alerts, and nobody else
 * anything: 401 without a session, 403 for another account's area (an admin included),
 * 404 for an id that does not exist.
 */
describe('declarations.geojson endpoint (MV-067)', () => {
  let payload: Payload
  let admin: User
  let anna: User
  let ben: User
  let annaArea: number
  let otherAnnaArea: number
  let unreadDeclaration: number
  let readDeclaration: number

  const signIn = (who: User | null) =>
    vi.mocked(requireUser).mockImplementation(async () => {
      if (!who) throw new Unauthorized()
      return who
    })

  const get = (id: number | string) =>
    GET(new Request(`http://localhost/api/watch-areas/${id}/declarations.geojson`), {
      params: Promise.resolve({ id: String(id) }),
    })

  async function area(owner: User, name: string) {
    const doc = await payload.create({
      collection: 'watch-areas',
      data: { name, center: SQUARE_CENTER, radiusM: 500, owner: owner.id },
      overrideAccess: true,
    })
    return doc.id
  }

  async function alert(owner: User, watchArea: number, declaration: number, readAt?: string) {
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

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    admin = await createTestUser(payload, { role: 'admin' })
    anna = await createTestUser(payload)
    ben = await createTestUser(payload)
    annaArea = await area(anna, 'Mökki')
    otherAnnaArea = await area(anna, 'Mökin naapuri')

    const now = Date.now()
    unreadDeclaration = await insertDeclarationRaw(payload, {
      sourceId: 'detail.1',
      cuttingTypeCode: 3,
      receivedAt: new Date(now - 86_400_000).toISOString(),
    })
    readDeclaration = await insertDeclarationRaw(payload, {
      sourceId: 'detail.2',
      receivedAt: new Date(now - 2 * 86_400_000).toISOString(),
      wkt: EAST_SQUARE_WKT,
    })
    await alert(anna, annaArea, unreadDeclaration)
    await alert(anna, annaArea, readDeclaration, new Date(now).toISOString())
    // Unread, but of the other area: not "new" on this one.
    await alert(anna, otherAnnaArea, readDeclaration)
  })

  it('gives the owner the declarations in WGS 84 with isNew from the unread alerts', async () => {
    signIn(anna)
    const res = await get(annaArea)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/geo+json')
    expect(res.headers.get('cache-control')).toBe('private, no-store')

    const body = (await res.json()) as FeatureCollection<
      MultiPolygon,
      WatchAreaDeclarationProperties
    >
    expect(body.type).toBe('FeatureCollection')
    // Newest first.
    expect(body.features.map((f) => [f.id, f.properties.isNew])).toEqual([
      [unreadDeclaration, true],
      [readDeclaration, false],
    ])
    expect(body.features[0]!.properties).toMatchObject({
      sourceId: 'detail.1',
      cuttingTypeCode: 3,
      distanceM: 0,
    })
    expect(body.features[1]!.properties.distanceM).toBeCloseTo(150, 0)
    const [lon, lat] = body.features[0]!.geometry.coordinates[0]![0]![0]!
    expect(lon).toBeCloseTo(SQUARE_CENTER[0], 2)
    expect(lat).toBeCloseTo(SQUARE_CENTER[1], 2)

    // The other area of the same owner has its own alert state.
    const other = (await (await get(otherAnnaArea)).json()) as typeof body
    expect(other.features.map((f) => [f.id, f.properties.isNew])).toEqual([
      [unreadDeclaration, false],
      [readDeclaration, true],
    ])
  })

  it('answers 403 for another account, an admin included, and 401 without a session', async () => {
    for (const who of [ben, admin]) {
      signIn(who)
      const res = await get(annaArea)
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    }
    signIn(null)
    const res = await get(annaArea)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
  })

  it('answers 404 for an id that does not exist or is not an id', async () => {
    signIn(anna)
    for (const id of [annaArea + 1000, 'abc', '0']) {
      const res = await get(id)
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ ok: false, error: { code: 'not_found' } })
    }
  })

  it('hands the page the area itself with the same declarations', async () => {
    const detail = await loadWatchAreaDetail(payload, anna, annaArea)
    expect(detail.area).toMatchObject({
      id: annaArea,
      name: 'Mökki',
      radiusM: 500,
      lastCheckedAt: null,
    })
    expect(detail.declarations.features).toHaveLength(2)
    await expect(loadWatchAreaDetail(payload, ben, annaArea)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})
