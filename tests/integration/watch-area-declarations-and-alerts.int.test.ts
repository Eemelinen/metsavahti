import { type MigrateUpArgs, type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Alert, Declaration, User, WatchArea } from '@/payload-types'
import * as migration from '@/payload/migrations/20260920_145929_watch_area_declarations_alerts'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const drizzle = async () => ((await getTestPayload()).db as unknown as PostgresAdapter).drizzle

const SNAPSHOT = { cuttingTypeLabel: 'Avohakkuu', areaHa: 1.5, distanceM: 120, receivedAt: null }

/** MV-034: `watch_area_declarations` (`01 §3.4`) and `alerts` (`01 §3.5`), access control. */
describe('watch_area_declarations + alerts', () => {
  let admin: User
  let owner: User
  let bystander: User
  let ownerArea: WatchArea
  let bystanderArea: WatchArea
  let declaration: Declaration
  let ownerAlert: Alert

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    admin = await createTestUser(payload, { role: 'admin' })
    owner = await createTestUser(payload, { role: 'user', name: 'Owner' })
    bystander = await createTestUser(payload, { role: 'user', name: 'Bystander' })

    const area = (user: User, name: string) =>
      payload.create({
        collection: 'watch-areas',
        data: { name, center: [25.75, 62.24], radiusM: 800, owner: user.id },
        overrideAccess: true,
      })
    ownerArea = await area(owner, 'Oma')
    bystanderArea = await area(bystander, 'Toisen')

    declaration = await payload.create({
      collection: 'declarations',
      data: {
        sourceId: 'forestusedeclaration.1',
        declarationNumber: '1-2026-1',
        cuttingTypeCode: 4,
        areaHa: 1.5,
        geomHash: 'g1',
        attrHash: 'a1',
        firstSeenAt: '2026-01-15T10:00:00.000Z',
        lastSeenAt: '2026-01-15T10:00:00.000Z',
      },
      overrideAccess: true,
    })

    const alert = (user: User, watchArea: WatchArea) =>
      payload.create({
        collection: 'alerts',
        data: {
          user: user.id,
          watchArea: watchArea.id,
          declaration: declaration.id,
          changeType: 'new',
          snapshot: SNAPSHOT,
        },
        overrideAccess: true,
      })
    ownerAlert = await alert(owner, ownerArea)
    await alert(bystander, bystanderArea)
  })

  it('has the 01 §3.4–3.5 columns and indexes; the old alert columns are gone', async () => {
    const db = await drizzle()
    const columnsOf = async (table: string) =>
      (
        await db.execute<{ column_name: string }>(sql`
          SELECT column_name FROM information_schema.columns WHERE table_name = ${table}
        `)
      ).rows.map((c) => c.column_name)

    expect(await columnsOf('watch_area_declarations')).toEqual(
      expect.arrayContaining([
        'watch_area_id',
        'declaration_id',
        'first_matched_at',
        'last_matched_at',
        'last_seen_geom_hash',
        'last_seen_attr_hash',
        'distance_m',
      ]),
    )
    const alertColumns = await columnsOf('alerts')
    expect(alertColumns).toEqual(
      expect.arrayContaining([
        'user_id',
        'watch_area_id',
        'declaration_id',
        'change_type',
        'created_at',
        'read_at',
        'notified_at',
        'snapshot',
      ]),
    )
    for (const old of ['kind', 'status', 'sent_at', 'geom_hash', 'distance_m']) {
      expect(alertColumns).not.toContain(old)
    }

    const { rows: indexes } = await db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename IN ('alerts', 'watch_area_declarations')
    `)
    const byName = Object.fromEntries(indexes.map((i) => [i.indexname, i.indexdef]))
    expect(byName['watchArea_declaration_idx']).toMatch(
      /^CREATE UNIQUE INDEX .* \(watch_area_id, declaration_id\)$/,
    )
    expect(byName['user_createdAt_idx']).toContain('(user_id, created_at DESC)')
    expect(byName['user_notifiedAt_idx']).toContain('(user_id, notified_at)')

    const { rows: fks } = await db.execute<{ conname: string; confdeltype: string }>(sql`
      SELECT conname, confdeltype FROM pg_constraint
      WHERE conrelid = 'watch_area_declarations'::regclass AND contype = 'f'
    `)
    expect(fks.map((f) => f.confdeltype)).toEqual(['c', 'c'])
  })

  it('allows one join row per (watchArea, declaration) pair', async () => {
    const payload = await getTestPayload()
    const data = {
      watchArea: ownerArea.id,
      declaration: declaration.id,
      firstMatchedAt: '2026-02-01T00:00:00.000Z',
      lastMatchedAt: '2026-02-01T00:00:00.000Z',
      lastSeenGeomHash: 'g1',
      lastSeenAttrHash: 'a1',
      distanceM: 0,
    }
    const row = await payload.create({
      collection: 'watch-area-declarations',
      data,
      overrideAccess: true,
    })
    expect(row.distanceM).toBe(0)
    await expect(
      payload.create({ collection: 'watch-area-declarations', data, overrideAccess: true }),
    ).rejects.toThrow()
    // A different watch area for the same declaration is fine.
    await payload.create({
      collection: 'watch-area-declarations',
      data: { ...data, watchArea: bystanderArea.id, distanceM: 350.5 },
      overrideAccess: true,
    })
    expect(
      (await payload.count({ collection: 'watch-area-declarations', overrideAccess: true }))
        .totalDocs,
    ).toBe(2)
  })

  it('join rows are admin read-only: users cannot read, nobody writes through access control', async () => {
    const payload = await getTestPayload()
    const asAdmin = await payload.find({
      collection: 'watch-area-declarations',
      user: admin,
      overrideAccess: false,
    })
    expect(asAdmin.totalDocs).toBe(2)
    await expect(
      payload.find({ collection: 'watch-area-declarations', user: owner, overrideAccess: false }),
    ).rejects.toThrow()

    const existing = asAdmin.docs[0]!
    await expect(
      payload.create({
        collection: 'watch-area-declarations',
        data: { ...existing, id: undefined, watchArea: ownerArea.id, declaration: declaration.id },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'watch-area-declarations',
        id: existing.id,
        data: { distanceM: 1 },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: 'watch-area-declarations',
        id: existing.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('deleting a watch area removes its join rows (cascade), not the declaration', async () => {
    const payload = await getTestPayload()
    const area = await payload.create({
      collection: 'watch-areas',
      data: { name: 'Väliaikainen', center: [25.75, 62.24], radiusM: 500, owner: admin.id },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'watch-area-declarations',
      data: {
        watchArea: area.id,
        declaration: declaration.id,
        firstMatchedAt: '2026-02-01T00:00:00.000Z',
        lastMatchedAt: '2026-02-01T00:00:00.000Z',
        lastSeenGeomHash: 'g1',
        lastSeenAttrHash: 'a1',
        distanceM: 10,
      },
      overrideAccess: true,
    })
    await payload.delete({ collection: 'watch-areas', id: area.id, overrideAccess: true })
    expect(
      (
        await payload.count({
          collection: 'watch-area-declarations',
          where: { watchArea: { equals: area.id } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(0)
    expect(
      (await payload.count({ collection: 'declarations', overrideAccess: true })).totalDocs,
    ).toBe(1)
  })

  it('owners read only their own alerts; admins read all; anonymous nothing', async () => {
    const payload = await getTestPayload()
    const asOwner = await payload.find({ collection: 'alerts', user: owner, overrideAccess: false })
    expect(asOwner.totalDocs).toBe(1)
    expect(asOwner.docs[0]!.id).toBe(ownerAlert.id)
    expect(asOwner.docs[0]!.snapshot).toEqual(SNAPSHOT)

    const asBystander = await payload.find({
      collection: 'alerts',
      user: bystander,
      overrideAccess: false,
    })
    expect(asBystander.totalDocs).toBe(1)
    expect(asBystander.docs[0]!.id).not.toBe(ownerAlert.id)

    const asAdmin = await payload.find({ collection: 'alerts', user: admin, overrideAccess: false })
    expect(asAdmin.totalDocs).toBe(2)

    await expect(
      payload.findByID({
        collection: 'alerts',
        id: ownerAlert.id,
        user: bystander,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'alerts', user: null, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('owners may set readAt on their own alerts and nothing else', async () => {
    const payload = await getTestPayload()
    const readAt = '2026-03-01T12:00:00.000Z'
    const updated = await payload.update({
      collection: 'alerts',
      id: ownerAlert.id,
      data: {
        readAt,
        // Everything below is admin-only on update and must be ignored for an owner.
        changeType: 'removed',
        notifiedAt: '2026-03-01T12:00:00.000Z',
        snapshot: { distanceM: 999 },
        user: bystander.id,
        watchArea: bystanderArea.id,
      },
      user: owner,
      overrideAccess: false,
    })
    expect(updated.readAt).toBe(readAt)
    expect(updated.changeType).toBe('new')
    expect(updated.notifiedAt).toBeFalsy()
    expect(updated.snapshot).toEqual(SNAPSHOT)
    expect(typeof updated.user === 'object' ? updated.user.id : updated.user).toBe(owner.id)
    expect(typeof updated.watchArea === 'object' ? updated.watchArea.id : updated.watchArea).toBe(
      ownerArea.id,
    )

    // Not the owner → the access query matches nothing → not found.
    await expect(
      payload.update({
        collection: 'alerts',
        id: ownerAlert.id,
        data: { readAt },
        user: bystander,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Admins can change delivery state and the change type.
    const byAdmin = await payload.update({
      collection: 'alerts',
      id: ownerAlert.id,
      data: { notifiedAt: '2026-03-02T08:00:00.000Z', changeType: 'geometry_changed' },
      user: admin,
      overrideAccess: false,
    })
    expect(byAdmin.notifiedAt).toBe('2026-03-02T08:00:00.000Z')
    expect(byAdmin.changeType).toBe('geometry_changed')
  })

  it('owners cannot create or delete alerts', async () => {
    const payload = await getTestPayload()
    await expect(
      payload.create({
        collection: 'alerts',
        data: {
          user: owner.id,
          watchArea: ownerArea.id,
          declaration: declaration.id,
          changeType: 'new',
          snapshot: SNAPSHOT,
        },
        user: owner,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: 'alerts',
        id: ownerAlert.id,
        user: owner,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect((await payload.count({ collection: 'alerts', overrideAccess: true })).totalDocs).toBe(2)
  })

  it('migration round-trip converts old alerts and seeds the join table (runs last)', async () => {
    const payload = await getTestPayload()
    const db = await drizzle()
    const args = { db } as unknown as MigrateUpArgs

    // Set the state this test depends on itself, so it does not rely on the update test above.
    await payload.update({
      collection: 'alerts',
      id: ownerAlert.id,
      data: { changeType: 'geometry_changed', notifiedAt: '2026-03-02T08:00:00.000Z' },
      overrideAccess: true,
    })

    await migration.down(args)
    const { rows: oldShape } = await db.execute<{ kind: string; status: string }>(sql`
      SELECT kind::text AS kind, status::text AS status FROM alerts WHERE id = ${ownerAlert.id}
    `)
    // geometry_changed maps back to kind = changed; a set notifiedAt maps back to status = sent.
    expect(oldShape[0]).toEqual({ kind: 'changed', status: 'sent' })

    // An alert written by the pre-MV-034 pipeline: kind/status/sent_at/geom_hash/distance_m.
    await db.execute(sql`
      INSERT INTO alerts (user_id, watch_area_id, declaration_id, kind, distance_m, geom_hash, status, sent_at)
      VALUES (${bystander.id}, ${bystanderArea.id}, ${declaration.id}, 'changed', 42.4, 'g-old', 'sent', '2026-02-02T00:00:00.000Z')
    `)

    await migration.up(args)
    const converted = await payload.find({
      collection: 'alerts',
      where: { user: { equals: bystander.id } },
      sort: 'id',
      overrideAccess: true,
    })
    expect(converted.totalDocs).toBe(2)
    const legacy = converted.docs.at(-1)!
    expect(legacy.changeType).toBe('geometry_changed')
    expect(legacy.notifiedAt).toBe('2026-02-02T00:00:00.000Z')
    expect(legacy.readAt).toBeFalsy()
    expect(legacy.snapshot).toMatchObject({
      cuttingTypeLabel: 'Avohakkuu',
      areaHa: 1.5,
      distanceM: 42.4,
    })
    // The bystander's first alert keeps its distance: down copies it to `distance_m`, up rebuilds the snapshot.
    expect((converted.docs[0]!.snapshot as { distanceM: number }).distanceM).toBe(120)

    // One join row per (watch area, declaration), hashes from the latest alert of the pair.
    const joins = await payload.find({
      collection: 'watch-area-declarations',
      sort: 'id',
      overrideAccess: true,
    })
    expect(joins.totalDocs).toBe(2)
    const forBystander = joins.docs.find(
      (j) => (typeof j.watchArea === 'object' ? j.watchArea.id : j.watchArea) === bystanderArea.id,
    )!
    expect(forBystander.lastSeenGeomHash).toBe('g-old')
    expect(forBystander.lastSeenAttrHash).toBe('a1')
    expect(forBystander.distanceM).toBe(42.4)
  })
})
