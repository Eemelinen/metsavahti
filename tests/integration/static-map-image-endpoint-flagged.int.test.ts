import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  MAP_IMAGE_CACHE_SECONDS,
  mapImageResponse,
  signMapImageToken,
} from '@/lib/alerts/map-image'
import { env } from '@/lib/env'
import { signToken } from '@/lib/tokens'
import type { Alert, User, WatchArea } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from a PNG's IHDR chunk (bytes 16–23). */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/**
 * MV-077: `GET /api/alerts/[id]/map-image.png` — owner session or signed token, PNG rendered
 * from the watch circle and the declaration polygon, cached 7 d, behind `ENABLE_MAP_IMAGES`.
 */
describe('static map image endpoint (MV-077)', () => {
  let payload: Payload
  let owner: User & { password: string }
  let bystander: User & { password: string }
  let ownerAlert: Alert
  let bystanderAlert: Alert
  let alertWithoutGeometry: Alert

  async function get(
    id: number | string,
    { query = '', cookie }: { query?: string; cookie?: string } = {},
  ) {
    const { GET } = await import('@/app/api/alerts/[id]/map-image.png/route')
    const headers: Record<string, string> = cookie
      ? { cookie, origin: env.NEXT_PUBLIC_SERVER_URL }
      : {}
    return GET(
      new Request(`http://localhost/api/alerts/${id}/map-image.png${query}`, { headers }),
      {
        params: Promise.resolve({ id: String(id) }),
      },
    )
  }

  async function sessionCookie(user: User & { password: string }) {
    const { token } = await payload.login({
      collection: 'users',
      data: { email: user.email, password: user.password },
    })
    return `payload-token=${token}`
  }

  /** What a client sees of a response, compared against `PNG_RESPONSE` in one assertion. */
  async function describePng(res: Response) {
    const bytes = new Uint8Array(await res.arrayBuffer())
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      cacheControl: res.headers.get('cache-control'),
      signature: [...bytes.slice(0, 8)],
      size: bytes.byteLength >= 24 ? pngSize(bytes) : null,
    }
  }

  const PNG_RESPONSE = {
    status: 200,
    contentType: 'image/png',
    cacheControl: `private, max-age=${MAP_IMAGE_CACHE_SECONDS}`,
    signature: PNG_SIGNATURE,
    size: { width: 1200, height: 640 },
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    owner = await createTestUser(payload, { role: 'user', name: 'Owner' })
    bystander = await createTestUser(payload, { role: 'user', name: 'Bystander' })

    const area = (user: User, name: string): Promise<WatchArea> =>
      payload.create({
        collection: 'watch-areas',
        // Near the helper's square (435000–435100 E, 6900000–6900100 N).
        data: { name, center: [25.745, 62.225], radiusM: 1000, owner: user.id },
        overrideAccess: true,
      })
    const ownerArea = await area(owner, 'Oma')
    const bystanderArea = await area(bystander, 'Toisen')

    const declarationId = await insertDeclarationRaw(payload, {
      sourceId: 'forestusedeclaration.77',
      cuttingTypeCode: 5,
    })
    const bare = await payload.create({
      collection: 'declarations',
      data: {
        sourceId: 'forestusedeclaration.78',
        declarationNumber: '1-2026-78',
        cuttingTypeCode: 2,
        geomHash: 'g78',
        attrHash: 'a78',
        firstSeenAt: '2026-01-15T10:00:00.000Z',
        lastSeenAt: '2026-01-15T10:00:00.000Z',
      },
      overrideAccess: true,
    })

    const alert = (user: User, watchArea: WatchArea, declaration: number) =>
      payload.create({
        collection: 'alerts',
        data: {
          user: user.id,
          watchArea: watchArea.id,
          declaration,
          changeType: 'new',
          snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 1, distanceM: 0, receivedAt: null },
        },
        overrideAccess: true,
      })
    ownerAlert = await alert(owner, ownerArea, declarationId)
    bystanderAlert = await alert(bystander, bystanderArea, declarationId)
    alertWithoutGeometry = await alert(owner, ownerArea, bare.id)
  })

  describe('owner session', () => {
    it('returns a PNG of the watch circle and the declaration, cached for 7 days', async () => {
      const res = await get(ownerAlert.id, { cookie: await sessionCookie(owner) })
      expect(await describePng(res)).toEqual(PNG_RESPONSE)
    })

    it('draws the watch circle alone when the declaration has no geometry', async () => {
      const res = await get(alertWithoutGeometry.id, { cookie: await sessionCookie(owner) })
      expect(await describePng(res)).toEqual(PNG_RESPONSE)
    })

    it('answers 403 to a signed-in user who does not own the alert', async () => {
      const res = await get(ownerAlert.id, { cookie: await sessionCookie(bystander) })
      expect(res.status).toBe(403)
      expect(res.headers.get('content-type')).not.toBe('image/png')
    })

    it('answers 401 without a session or token, 404 for an alert that does not exist', async () => {
      expect((await get(ownerAlert.id)).status).toBe(401)
      const cookie = await sessionCookie(owner)
      expect((await get(999_999, { cookie })).status).toBe(404)
      expect((await get('abc', { cookie })).status).toBe(404)
    })
  })

  describe('signed token', () => {
    it('returns the PNG without a session for a token signed for that alert', async () => {
      const token = await signMapImageToken(owner.id, ownerAlert.id)
      const res = await get(ownerAlert.id, { query: `?token=${token}` })
      expect(await describePng(res)).toEqual(PNG_RESPONSE)
    })

    it('answers 403 to a token for another alert, a tampered, expired or wrong-purpose token', async () => {
      const otherAlert = await signMapImageToken(owner.id, alertWithoutGeometry.id)
      expect((await get(ownerAlert.id, { query: `?token=${otherAlert}` })).status).toBe(403)

      const valid = await signMapImageToken(owner.id, ownerAlert.id)
      const tampered = `${valid.slice(0, -2)}${valid.endsWith('AA') ? 'BB' : 'AA'}`
      expect((await get(ownerAlert.id, { query: `?token=${tampered}` })).status).toBe(403)

      const expired = await signMapImageToken(
        owner.id,
        ownerAlert.id,
        new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      )
      expect((await get(ownerAlert.id, { query: `?token=${expired}` })).status).toBe(403)

      const wrongPurpose = await signToken(
        'email-change',
        { sub: String(owner.id), jti: 'x', alertId: String(ownerAlert.id) },
        3600,
      )
      expect((await get(ownerAlert.id, { query: `?token=${wrongPurpose}` })).status).toBe(403)
    })

    it('answers 403 to a token whose account does not own the alert', async () => {
      const token = await signMapImageToken(owner.id, bystanderAlert.id)
      expect((await get(bystanderAlert.id, { query: `?token=${token}` })).status).toBe(403)
    })

    it("refuses a bad token even next to the owner's session", async () => {
      const res = await get(ownerAlert.id, {
        query: '?token=garbage',
        cookie: await sessionCookie(owner),
      })
      expect(res.status).toBe(403)
    })
  })

  it('answers 404 when ENABLE_MAP_IMAGES is off', async () => {
    const token = await signMapImageToken(owner.id, ownerAlert.id)
    const request = new Request(
      `http://localhost/api/alerts/${ownerAlert.id}/map-image.png?token=${token}`,
    )
    const res = await mapImageResponse(payload, request, String(ownerAlert.id), { enabled: false })
    expect(res.status).toBe(404)
  })
})
