import { HttpResponse, http } from 'msw'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/watch-areas/preview/route'
import { wfs } from '@/config/wfs'
import { requireUser } from '@/lib/auth/guards'
import { Unauthorized } from '@/lib/errors'
import { bboxForWatchArea, snapBboxToGrid } from '@/lib/geo/bbox'
import { isBboxFetched } from '@/lib/geo/spatial-queries'
import { previewFetchRateLimiter, watchAreaPreview } from '@/lib/watch-areas/preview'
import { MetsakeskusWfsClient } from '@/lib/wfs/client'
import type { DeclarationFeatureCollection } from '@/lib/wfs/schemas'
import type { User } from '@/payload-types'
import { SAMPLE_WATCH_AREA } from '../fixtures/sample-area'
import manifest from '../fixtures/wfs/manifest.json'
import { server } from '../helpers/msw'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'
import { loadWfsFixture, requestBbox, wfsResponseForBbox } from '../helpers/wfs-fixture'

// The route takes the account from the session; here the session is whoever the test says.
vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))

const WFS_URL = 'http://wfs.test/rajapinnat/v1/ows/'
/** Every fixture declaration is in force on this day (recorded 2026-10-24). */
const NOW = new Date('2026-10-24T12:00:00.000Z')
const CENTER: [number, number] = [SAMPLE_WATCH_AREA.center.lng, SAMPLE_WATCH_AREA.center.lat]
const RADIUS: number = SAMPLE_WATCH_AREA.radiusM
const IN_CIRCLE = manifest.fixtures.inside.ids.length + manifest.fixtures.borderline.ids.length

/** The recorded Sipoo set: what the WFS holds around the sample area. */
function sipooSet(): DeclarationFeatureCollection {
  const sets = ['inside', 'borderline', 'outside'].map((s) => loadWfsFixture(`${s}.json`))
  const features = sets.flatMap((fc) => fc.features)
  return { ...sets[0]!, features, numberReturned: features.length }
}

/**
 * MV-063: `GET /api/watch-areas/preview?lng&lat&radius` answers from the local cache and
 * fetches a box from the WFS only the first time (`wfs_bbox_fetches`), 5 fetches/min/user.
 */
describe('preview endpoint (MV-063)', () => {
  let payload: Payload
  let user: User
  let wfsCalls: URL[]
  let wfsStatus: number

  const signIn = (who: User | null) =>
    vi.mocked(requireUser).mockImplementation(async () => {
      if (!who) throw new Unauthorized()
      return who
    })

  const preview = (center: [number, number] = CENTER, radiusM = RADIUS) =>
    watchAreaPreview(payload, user.id, center, radiusM, {
      now: NOW,
      wfs: new MetsakeskusWfsClient({
        baseUrl: WFS_URL,
        layer: 'v1:forestusedeclaration',
        retries: 0,
      }),
    })

  const get = (query: string) =>
    GET(new Request(`http://localhost/api/watch-areas/preview${query}`))

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' }) // Postgres goes over real sockets
    payload = await getTestPayload()
    const fixture = sipooSet()
    server.use(
      http.get(WFS_URL, ({ request }) => {
        const url = new URL(request.url)
        wfsCalls.push(url)
        if (wfsStatus !== 200) return new HttpResponse('down', { status: wfsStatus })
        return HttpResponse.json(wfsResponseForBbox(fixture, requestBbox(url.searchParams)))
      }),
    )
  })

  beforeEach(async () => {
    await resetDatabase(payload)
    user = await createTestUser(payload)
    signIn(user)
    wfsCalls = []
    wfsStatus = 200
  })

  afterAll(() => server.close())

  it('cold bbox: fetches it from the WFS exactly once, then answers from the cache', async () => {
    const result = await preview()

    expect(wfsCalls).toHaveLength(1)
    const fetchedBox = snapBboxToGrid(bboxForWatchArea(CENTER, RADIUS), wfs.previewFetchCellM)
    expect(requestBbox(wfsCalls[0]!.searchParams)).toEqual(fetchedBox)
    expect(result.count).toBe(IN_CIRCLE)
    expect(result.geojson.features).toHaveLength(IN_CIRCLE)
    expect(result.geojson.features.map((f) => f.properties.sourceId).sort()).toEqual(
      [...manifest.fixtures.inside.ids, ...manifest.fixtures.borderline.ids].sort(),
    )
    for (const f of result.geojson.features) {
      const [lng, lat] = f.geometry.coordinates[0]![0]![0]!
      expect(lng).toBeCloseTo(CENTER[0], 1) // WGS 84, not EPSG:3067 metres
      expect(lat).toBeCloseTo(CENTER[1], 1)
      expect(f.properties.distanceM).toBeLessThanOrEqual(RADIUS)
    }

    const { docs } = await payload.find({ collection: 'wfs-bbox-fetches', overrideAccess: true })
    expect(docs.map((d) => [d.minE, d.minN, d.maxE, d.maxN])).toEqual([fetchedBox])
    expect(docs[0]!.featureCount).toBe(sipooSet().features.length)
  })

  it('warm bbox: no WFS call for the same circle, a smaller one or a nudged pin', async () => {
    const first = await preview()
    wfsCalls = []

    expect(await preview()).toEqual(first)
    expect((await preview(CENTER, 250)).count).toBeLessThanOrEqual(first.count)
    expect((await preview([CENTER[0] + 0.001, CENTER[1] + 0.001])).count).toBeGreaterThan(0)
    expect(wfsCalls).toHaveLength(0)
  })

  it('treats a box covered by several earlier fetches as warm', async () => {
    const [e] = snapBboxToGrid(bboxForWatchArea(CENTER, RADIUS), wfs.previewFetchCellM)
    expect(await isBboxFetched(payload, bboxForWatchArea(CENTER, RADIUS))).toBe(false)
    await payload.create({
      collection: 'wfs-bbox-fetches',
      data: {
        minE: e - 50_000,
        minN: 6_600_000,
        maxE: e + 2_500,
        maxN: 6_800_000,
        featureCount: 0,
        fetchedAt: NOW.toISOString(),
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'wfs-bbox-fetches',
      data: {
        minE: e + 2_500,
        minN: 6_600_000,
        maxE: e + 50_000,
        maxN: 6_800_000,
        featureCount: 0,
        fetchedAt: NOW.toISOString(),
      },
      overrideAccess: true,
    })
    expect(await isBboxFetched(payload, bboxForWatchArea(CENTER, RADIUS))).toBe(true)

    expect((await preview()).count).toBe(0) // nothing cached there, and nothing fetched
    expect(wfsCalls).toHaveLength(0)
  })

  it('allows 5 live fetches a minute per user, then answers 429 without calling the WFS', async () => {
    await previewFetchRateLimiter.reset()
    // Six cold boxes ~20 km apart near Tampere, far from the recorded Sipoo set.
    const centers = Array.from({ length: 6 }, (_, i): [number, number] => [24 + i * 0.4, 61.5])
    for (const center of centers.slice(0, 5)) {
      expect((await preview(center)).count).toBe(0)
    }
    expect(wfsCalls).toHaveLength(5)

    await expect(preview(centers[5])).rejects.toMatchObject({ code: 'rate_limited' })
    expect(wfsCalls).toHaveLength(5)
    // A warm box still answers.
    expect((await preview(centers[0])).count).toBe(0)

    const res = await get(`?lng=${centers[5]![0]}&lat=${centers[5]![1]}&radius=1000`)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    await previewFetchRateLimiter.reset()
  })

  it('records nothing when the WFS fails, so the next preview fetches again', async () => {
    wfsStatus = 400
    await expect(preview()).rejects.toMatchObject({ code: 'external_service' })
    const { totalDocs } = await payload.count({
      collection: 'wfs-bbox-fetches',
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)

    wfsStatus = 200
    expect((await preview()).count).toBe(IN_CIRCLE)
    expect(wfsCalls).toHaveLength(2)
  })

  describe('GET /api/watch-areas/preview', () => {
    const query = `?lng=${CENTER[0]}&lat=${CENTER[1]}&radius=${RADIUS}`

    it('answers { count, geojson } for a signed-in user', async () => {
      const res = await get(query)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      const body = await res.json()
      expect(body).toMatchObject({ ok: true, data: { count: IN_CIRCLE } })
      expect(body.data.geojson).toMatchObject({ type: 'FeatureCollection' })
      expect(body.data.geojson.features).toHaveLength(IN_CIRCLE)
      expect(wfsCalls).toHaveLength(1)

      await get(query)
      expect(wfsCalls).toHaveLength(1)
    })

    it('refuses a guest with 401', async () => {
      signIn(null)
      const res = await get(query)
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
      expect(wfsCalls).toHaveLength(0)
    })

    it.each([
      ['a missing radius', `?lng=${CENTER[0]}&lat=${CENTER[1]}`],
      ['a radius under 100 m', `?lng=${CENTER[0]}&lat=${CENTER[1]}&radius=50`],
      ['a radius over 5 km', `?lng=${CENTER[0]}&lat=${CENTER[1]}&radius=5001`],
      ['a centre outside Finland', '?lng=13.4&lat=52.5&radius=1000'],
      ['a non-numeric coordinate', `?lng=abc&lat=${CENTER[1]}&radius=1000`],
    ])('answers 400 to %s', async (_, q) => {
      const res = await get(q)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false, error: 'invalid_query' })
      expect(wfsCalls).toHaveLength(0)
    })
  })
})
