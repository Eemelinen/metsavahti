import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import { loadAlertDetail } from '@/lib/alerts/detail'
import { toWgs84 } from '@/lib/geo/crs'
import { Forbidden, NotFound } from '@/lib/errors'
import type { AlertChangeType } from '@/payload/collections/Alerts'
import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

// 200 m west of the helper square's centroid (435050, 6900050): the square is 150 m away.
const CENTER = toWgs84([434850, 6900050])
const ALERTED_AT = '2026-10-20T06:00:00.000Z'

/**
 * MV-082: what `/ilmoitukset/[id]` reads (`loadAlertDetail()`) against a real Payload +
 * PostGIS. Only the alert's owner may open it (an admin neither: the app pages are personal);
 * a `removed` alert stays hidden while `ALERT_ON_REMOVED` is off (off in `.env.test`). The
 * facts are the snapshot's; the polygon comes in WGS 84 with its distance from the area's
 * centre, and "Tiedot päivittyneet" (`updated`) appears once the declaration has a revision
 * after the alert, has left the data since, or no longer matches the snapshot.
 */
describe('/ilmoitukset/[id] alert detail (MV-082)', () => {
  let admin: User
  let anna: User
  let ben: User
  let mokki: number

  const db = async () => ((await getTestPayload()).db as unknown as PostgresAdapter).drizzle

  async function declaration(sourceId: string) {
    const id = await insertDeclarationRaw(await getTestPayload(), {
      sourceId,
      cuttingTypeCode: 5,
      areaHa: 2.4,
      receivedAt: '2026-10-18T09:00:00.000Z',
    })
    await (
      await db()
    ).execute(sql`UPDATE declarations SET cutting_type_label = 'Avohakkuu' WHERE id = ${id}`)
    return id
  }

  async function alert(
    declarationId: number,
    { changeType = 'new', owner = anna }: { changeType?: AlertChangeType; owner?: User } = {},
  ) {
    const payload = await getTestPayload()
    const doc = await payload.create({
      collection: 'alerts',
      data: {
        user: owner.id,
        watchArea: mokki,
        declaration: declarationId,
        changeType,
        snapshot: {
          cuttingTypeLabel: 'Avohakkuu',
          areaHa: 2.4,
          distanceM: 150,
          receivedAt: '2026-10-18T09:00:00.000Z',
        },
      },
      overrideAccess: true,
    })
    await (
      await db()
    ).execute(sql`UPDATE alerts SET created_at = ${ALERTED_AT}::timestamptz WHERE id = ${doc.id}`)
    return doc.id
  }

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    admin = await createTestUser(payload, { role: 'admin' })
    anna = await createTestUser(payload)
    ben = await createTestUser(payload)
    const area = await payload.create({
      collection: 'watch-areas',
      data: { name: 'Mökki', center: CENTER, radiusM: 500, owner: anna.id },
      overrideAccess: true,
    })
    mokki = area.id
  })

  it('reads the owner’s alert with its area, snapshot and polygon', async () => {
    const payload = await getTestPayload()
    const declarationId = await declaration('mv082-plain')
    const id = await alert(declarationId)

    const detail = await loadAlertDetail(payload, anna, id)
    expect(detail).toMatchObject({
      id,
      changeType: 'new',
      unread: true,
      watchArea: { id: mokki, name: 'Mökki', radiusM: 500 },
      snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 2.4, distanceM: 150 },
      cuttingTypeCode: 5,
      declarationNumber: '1-2026-1',
      updated: null,
    })
    expect(detail.validUntil).toBe('2029-10-18T09:00:00.000Z')
    expect(detail.declaration?.id).toBe(declarationId)
    expect(detail.declaration?.geometry.type).toBe('MultiPolygon')
    // WGS 84 near Jyväskylä, not EPSG:3067 metres.
    const [lon, lat] = detail.declaration!.geometry.coordinates[0]![0]![0]!
    expect(lon).toBeGreaterThan(20)
    expect(lon).toBeLessThan(32)
    expect(lat).toBeGreaterThan(59)
    expect(lat).toBeLessThan(71)
    expect(detail.declaration!.properties.distanceM).toBeCloseTo(150, 0)
  })

  it('is NotFound for a missing or hidden alert and Forbidden for anyone but the owner', async () => {
    const payload = await getTestPayload()
    const declarationId = await declaration('mv082-access')
    const id = await alert(declarationId)
    const removed = await alert(declarationId, { changeType: 'removed' })

    await expect(loadAlertDetail(payload, ben, id)).rejects.toBeInstanceOf(Forbidden)
    await expect(loadAlertDetail(payload, admin, id)).rejects.toBeInstanceOf(Forbidden)
    await expect(loadAlertDetail(payload, anna, 999_999)).rejects.toBeInstanceOf(NotFound)
    await expect(loadAlertDetail(payload, anna, removed)).rejects.toBeInstanceOf(NotFound)
  })

  it('flags a declaration that changed after the alert', async () => {
    const payload = await getTestPayload()
    const changed = await declaration('mv082-changed')
    const changedAlert = await alert(changed)
    await (
      await db()
    ).execute(sql`
      UPDATE declarations
      SET cutting_type_code = 3, cutting_type_label = 'Harvennushakkuu', area_ha = 3.1
      WHERE id = ${changed}
    `)
    expect((await loadAlertDetail(payload, anna, changedAlert)).updated).toEqual({
      removed: false,
      changes: [
        { field: 'cuttingType', was: 'Avohakkuu', now: 'Harvennushakkuu' },
        { field: 'areaHa', was: 2.4, now: 3.1 },
      ],
    })

    // A revision after the alert (a geometry change, say) flags it without a changed fact.
    const revised = await declaration('mv082-revised')
    const revisedAlert = await alert(revised)
    await payload.create({
      collection: 'declaration-revisions',
      data: {
        declaration: revised,
        prevGeomHash: 'old',
        prevAttrHash: 'old',
        changedAt: '2026-10-19T06:00:00.000Z',
      },
      overrideAccess: true,
    })
    expect((await loadAlertDetail(payload, anna, revisedAlert)).updated).toBeNull()
    await payload.create({
      collection: 'declaration-revisions',
      data: {
        declaration: revised,
        prevGeomHash: 'older',
        prevAttrHash: 'older',
        changedAt: '2026-10-21T06:00:00.000Z',
      },
      overrideAccess: true,
    })
    expect((await loadAlertDetail(payload, anna, revisedAlert)).updated).toEqual({
      removed: false,
      changes: [],
    })

    // Gone from the data since: the polygon still shows.
    const gone = await declaration('mv082-removed')
    const goneAlert = await alert(gone)
    await (
      await db()
    ).execute(sql`UPDATE declarations SET removed_at = '2026-10-22T06:00:00Z' WHERE id = ${gone}`)
    const detail = await loadAlertDetail(payload, anna, goneAlert)
    expect(detail.updated).toEqual({ removed: true, changes: [] })
    expect(detail.declaration?.id).toBe(gone)
  })
})
