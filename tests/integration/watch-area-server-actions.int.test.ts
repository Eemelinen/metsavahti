import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWatchArea,
  deleteWatchArea,
  toggleWatchAreaNotifications,
  updateWatchArea,
} from '@/app/(frontend)/(app)/vahtialueet/actions'
import { plans } from '@/config/plans'
import { requireUser } from '@/lib/auth/guards'
import { Unauthorized, publicMessages } from '@/lib/errors'
import type { User, WatchArea } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

// The actions take the account from the session; here the session is whoever the test says.
vi.mock('@/lib/auth/guards', () => ({ requireUser: vi.fn() }))

const signIn = (user: User | null) =>
  vi.mocked(requireUser).mockImplementation(async () => {
    if (!user) throw new Unauthorized()
    return user
  })

const JYVASKYLA = { lng: 25.75, lat: 62.24 }
const TAMPERE = { lng: 23.76, lat: 61.5 }
const FORM = { name: 'Mökkimetsä', center: JYVASKYLA, radiusM: 800, addressLabel: 'Mökkitie 1' }

async function readArea(id: number): Promise<WatchArea | null> {
  const payload = await getTestPayload()
  return payload.findByID({
    collection: 'watch-areas',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })
}

async function geomOf(id: number) {
  const payload = await getTestPayload()
  const db = (payload.db as unknown as PostgresAdapter).drizzle
  const { rows } = await db.execute<{ area: string | null; wkb: string | null }>(sql`
    SELECT ST_Area("geom_3067") AS area, ST_AsHEXEWKB("geom_3067") AS wkb
    FROM "watch_areas" WHERE "id" = ${id}
  `)
  return rows[0]
}

async function count(collection: 'alerts' | 'watch-area-declarations', watchArea: number) {
  const payload = await getTestPayload()
  const { totalDocs } = await payload.count({
    collection,
    where: { watchArea: { equals: watchArea } },
    overrideAccess: true,
  })
  return totalDocs
}

async function createAreaFor(user: User, name: string): Promise<number> {
  signIn(user)
  const result = await createWatchArea({ ...FORM, name })
  if (!result.ok) throw new Error(`createWatchArea failed: ${JSON.stringify(result)}`)
  return result.data.id
}

/**
 * MV-064: the watch-area Server Actions against a real Payload + PostGIS. Ownership (an id from
 * the browser reaches only the account's own areas), the plan limit as a `plan_limit` answer the
 * form can show, `update` re-buffering the area and clearing `lastCheckedAt`, and `delete`
 * cascading to the area's join rows and alerts (migration `alerts_watch_area_cascade`).
 */
describe('watch-area Server Actions (MV-064)', () => {
  let admin: User
  let declarationId: number

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    admin = await createTestUser(payload, { role: 'admin' })
    declarationId = await insertDeclarationRaw(payload, { sourceId: 'mv064-1' })
  })

  beforeEach(() => {
    vi.mocked(requireUser).mockReset()
  })

  it('creates an area owned by the session account, whatever owner the input names', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    signIn(user)

    const result = await createWatchArea({ ...FORM, owner: admin.id })
    expect(result.ok).toBe(true)
    const area = await readArea(result.ok ? result.data.id : -1)
    expect(area).toMatchObject({
      name: 'Mökkimetsä',
      center: [JYVASKYLA.lng, JYVASKYLA.lat],
      radiusM: 800,
      addressLabel: 'Mökkitie 1',
      notificationsEnabled: true,
      owner: user.id,
    })
    expect((await geomOf(area!.id))?.wkb).toBeTruthy()
  })

  it('answers invalid input with field errors and writes nothing', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    signIn(user)

    const result = await createWatchArea({
      name: '  ',
      center: { lng: 2.35, lat: 48.86 }, // Paris
      radiusM: 50,
    })
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: 'Anna alueelle nimi.',
        center: 'Valitse keskipiste Suomesta.',
        radiusM: 'Säteen pitää olla 100–5000 m.',
      },
    })
    const { totalDocs } = await payload.count({
      collection: 'watch-areas',
      where: { owner: { equals: user.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  it('refuses an area beyond the plan limit with a plan_limit error the form can show', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const max = plans.free.maxWatchAreas
    const ids: number[] = []
    for (let i = 0; i < max; i += 1) ids.push(await createAreaFor(user, `Alue ${i + 1}`))

    signIn(user)
    const refused = await createWatchArea({ ...FORM, name: 'Liikaa' })
    expect(refused).toEqual({
      ok: false,
      error: {
        code: 'plan_limit',
        message: `Tilaukseesi kuuluu enintään ${max} vahtialuetta. Poista jokin alue ennen uuden lisäämistä.`,
      },
    })
    const { totalDocs } = await payload.count({
      collection: 'watch-areas',
      where: { owner: { equals: user.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(max)

    // Deleting one frees the slot again.
    expect(await deleteWatchArea(ids[0])).toEqual({ ok: true, data: { id: ids[0] } })
    expect((await createWatchArea({ ...FORM, name: 'Uusi' })).ok).toBe(true)
  })

  it('needs a session for every action', async () => {
    const payload = await getTestPayload()
    const owner = await createTestUser(payload)
    const id = await createAreaFor(owner, 'Kirjautumaton')
    signIn(null)

    const unauthorized = {
      ok: false,
      error: { code: 'unauthorized', message: publicMessages.unauthorized },
    }
    expect(await createWatchArea(FORM)).toEqual(unauthorized)
    expect(await updateWatchArea(id, FORM)).toEqual(unauthorized)
    expect(await deleteWatchArea(id)).toEqual(unauthorized)
    expect(await toggleWatchAreaNotifications({ id, enabled: false })).toEqual(unauthorized)
    expect(await readArea(id)).toMatchObject({ name: 'Kirjautumaton', notificationsEnabled: true })
  })

  it('update moves and re-buffers the area, clears lastCheckedAt and keeps the switch', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const id = await createAreaFor(user, 'Ennen')
    await payload.update({
      collection: 'watch-areas',
      id,
      data: {
        notificationsEnabled: false,
        lastCheckedAt: '2026-10-01T06:00:00.000Z',
        lastDeclarationCount: 3,
      },
      overrideAccess: true,
    })
    const before = await geomOf(id)

    signIn(user)
    const result = await updateWatchArea(id, {
      name: 'Jälkeen',
      center: TAMPERE,
      radiusM: 2000,
      addressLabel: '',
    })
    expect(result).toEqual({ ok: true, data: { id } })

    const area = await readArea(id)
    expect(area).toMatchObject({
      name: 'Jälkeen',
      center: [TAMPERE.lng, TAMPERE.lat],
      radiusM: 2000,
      addressLabel: null,
      notificationsEnabled: false,
      lastCheckedAt: null,
    })
    const after = await geomOf(id)
    expect(after?.wkb).not.toBe(before?.wkb)
    expect(Number(after?.area)).toBeGreaterThan(Number(before?.area) * 6)
  })

  it("leaves someone else's area alone: not found for a user, forbidden for an admin", async () => {
    const payload = await getTestPayload()
    const owner = await createTestUser(payload)
    const intruder = await createTestUser(payload)
    const id = await createAreaFor(owner, 'Oma')

    const notFound = { ok: false, error: { code: 'not_found', message: publicMessages.not_found } }
    signIn(intruder)
    expect(await updateWatchArea(id, { ...FORM, name: 'Kaapattu' })).toEqual(notFound)
    expect(await toggleWatchAreaNotifications({ id, enabled: false })).toEqual(notFound)
    expect(await deleteWatchArea(id)).toEqual(notFound)

    const forbidden = { ok: false, error: { code: 'forbidden', message: publicMessages.forbidden } }
    signIn(admin)
    expect(await updateWatchArea(id, { ...FORM, name: 'Kaapattu' })).toEqual(forbidden)
    expect(await toggleWatchAreaNotifications({ id, enabled: false })).toEqual(forbidden)
    expect(await deleteWatchArea(id)).toEqual(forbidden)

    expect(await readArea(id)).toMatchObject({ name: 'Oma', notificationsEnabled: true })
  })

  it('toggles the notification switch of an own area', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const id = await createAreaFor(user, 'Kytkin')

    signIn(user)
    expect(await toggleWatchAreaNotifications({ id, enabled: false })).toEqual({
      ok: true,
      data: { id, enabled: false },
    })
    expect((await readArea(id))?.notificationsEnabled).toBe(false)
    expect((await toggleWatchAreaNotifications({ id, enabled: true })).ok).toBe(true)
    expect((await readArea(id))?.notificationsEnabled).toBe(true)
  })

  it('answers a malformed id or switch with the generic error and changes nothing', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const id = await createAreaFor(user, 'Ehjä')
    const internal = { ok: false, error: { code: 'internal', message: publicMessages.internal } }

    signIn(user)
    expect(await deleteWatchArea(String(id))).toEqual(internal)
    expect(await updateWatchArea(-1, FORM)).toEqual(internal)
    expect(await toggleWatchAreaNotifications({ id, enabled: 'false' })).toEqual(internal)
    expect(await readArea(id)).toMatchObject({ name: 'Ehjä', notificationsEnabled: true })
  })

  it("delete cascades to the area's join rows and alerts and nothing else", async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const other = await createTestUser(payload)
    const id = await createAreaFor(user, 'Poistettava')
    const keptId = await createAreaFor(other, 'Säilyvä')

    const seen = (watchArea: number) =>
      payload.create({
        collection: 'watch-area-declarations',
        data: {
          watchArea,
          declaration: declarationId,
          firstMatchedAt: '2026-10-01T06:00:00.000Z',
          lastMatchedAt: '2026-10-01T06:00:00.000Z',
          lastSeenGeomHash: 'geom-mv064-1',
          lastSeenAttrHash: 'attr-mv064-1',
          distanceM: 0,
        },
        overrideAccess: true,
      })
    const alert = (owner: User, watchArea: number) =>
      payload.create({
        collection: 'alerts',
        data: {
          user: owner.id,
          watchArea,
          declaration: declarationId,
          changeType: 'new',
          snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 1, distanceM: 0, receivedAt: null },
        },
        overrideAccess: true,
      })
    await seen(id)
    await seen(keptId)
    const deletedAlert = await alert(user, id)
    const keptAlert = await alert(other, keptId)
    const log = await payload.create({
      collection: 'notification-log',
      data: {
        user: user.id,
        type: 'alert_immediate',
        alerts: [deletedAlert.id, keptAlert.id],
        recipient: user.email,
        provider: 'nodemailer',
        status: 'sent',
        sentAt: '2026-10-01T06:05:00.000Z',
      },
      overrideAccess: true,
    })

    signIn(user)
    expect(await deleteWatchArea(id)).toEqual({ ok: true, data: { id } })

    expect(await readArea(id)).toBeNull()
    expect(await count('watch-area-declarations', id)).toBe(0)
    expect(await count('alerts', id)).toBe(0)
    // The log entry stays (it records a sent email) and loses only the deleted alert.
    const logAfter = await payload.findByID({
      collection: 'notification-log',
      id: log.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(logAfter.alerts).toEqual([keptAlert.id])
    // The other account's area, its rows and the declaration are untouched.
    expect(await readArea(keptId)).not.toBeNull()
    expect(await count('watch-area-declarations', keptId)).toBe(1)
    expect(await count('alerts', keptId)).toBe(1)
    const { totalDocs } = await payload.count({ collection: 'declarations', overrideAccess: true })
    expect(totalDocs).toBe(1)
  })
})
