import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const drizzle = async () => ((await getTestPayload()).db as unknown as PostgresAdapter).drizzle

/** MV-033: `declarations` + `declaration_revisions` per `01 §3.3`. */
describe('declarations + declaration_revisions', () => {
  let admin: User
  let user: User

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    // The first account becomes admin (Users hook); later ones cannot self-assign the role.
    admin = await createTestUser(payload, { role: 'admin' })
    user = await createTestUser(payload, { role: 'user' })
  })

  it('has the 01 §3.3 columns, the PostGIS columns and the indexes from the migration', async () => {
    const db = await drizzle()
    const { rows: columns } = await db.execute<{ column_name: string; is_generated: string }>(sql`
      SELECT column_name, is_generated FROM information_schema.columns
      WHERE table_name = 'declarations'
    `)
    const names = columns.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'source_id',
        'source_layer_version',
        'declaration_number',
        'cutting_type_code',
        'cutting_type_label',
        'area_ha',
        'received_at',
        'valid_until',
        'municipality_code',
        'raw_attributes',
        'geom_hash',
        'attr_hash',
        'first_seen_at',
        'last_seen_at',
        'removed_at',
        'geom',
        'centroid',
      ]),
    )
    for (const old of [
      'metsakeskus_id',
      'hakkuutapa',
      'arrival_date',
      'updated_at_source',
      'properties',
      'first_seen',
      'last_seen',
    ]) {
      expect(names).not.toContain(old)
    }
    expect(columns.find((c) => c.column_name === 'centroid')?.is_generated).toBe('ALWAYS')

    const { rows: geomCols } = await db.execute<{
      f_geometry_column: string
      type: string
      srid: number
    }>(sql`
      SELECT f_geometry_column, type, srid FROM geometry_columns
      WHERE f_table_name = 'declarations' ORDER BY f_geometry_column
    `)
    expect(geomCols).toEqual([
      { f_geometry_column: 'centroid', type: 'POINT', srid: 3067 },
      { f_geometry_column: 'geom', type: 'MULTIPOLYGON', srid: 3067 },
    ])

    const { rows: indexes } = await db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'declarations'
    `)
    const byName = Object.fromEntries(indexes.map((i) => [i.indexname, i.indexdef]))
    expect(byName['declarations_source_id_idx']).toMatch(/^CREATE UNIQUE INDEX/)
    expect(byName['declarations_valid_until_idx']).toContain('(valid_until)')
    expect(byName['declarations_removed_at_idx']).toContain('(removed_at)')
    expect(byName['declarations_geom_gist']).toContain('USING gist (geom)')
    expect(byName['declarations_centroid_gist']).toContain('USING gist (centroid)')
    expect(byName).not.toHaveProperty('declarations_metsakeskus_id_idx')
  })

  it('accepts a raw insert and derives the centroid inside the MultiPolygon', async () => {
    const payload = await getTestPayload()
    const id = await insertDeclarationRaw(payload, { sourceId: 'forestusedeclaration.1' })

    const db = await drizzle()
    const { rows } = await db.execute<{
      geom_type: string
      srid: number
      inside: boolean
      x: number
      y: number
    }>(sql`
      SELECT ST_GeometryType(geom) AS geom_type, ST_SRID(geom) AS srid,
             ST_Within(centroid, geom) AS inside, ST_X(centroid) AS x, ST_Y(centroid) AS y
      FROM declarations WHERE id = ${id}
    `)
    expect(rows[0]).toMatchObject({ geom_type: 'ST_MultiPolygon', srid: 3067, inside: true })
    expect(Number(rows[0]!.x)).toBeCloseTo(435050, 3)
    expect(Number(rows[0]!.y)).toBeCloseTo(6900050, 3)

    const doc = await payload.findByID({ collection: 'declarations', id, overrideAccess: true })
    expect(doc.sourceId).toBe('forestusedeclaration.1')
    expect(doc.validUntil).toBe('2029-01-15T10:00:00.000Z')
  })

  it('rejects a second row with the same sourceId (raw insert and Local API)', async () => {
    const payload = await getTestPayload()
    await expect(
      insertDeclarationRaw(payload, { sourceId: 'forestusedeclaration.1' }),
    ).rejects.toThrow(/declarations_source_id_idx|duplicate key/)

    await expect(
      payload.create({
        collection: 'declarations',
        data: {
          sourceId: 'forestusedeclaration.1',
          declarationNumber: '1-2026-2',
          geomHash: 'g',
          attrHash: 'a',
          firstSeenAt: '2026-01-15T10:00:00.000Z',
          lastSeenAt: '2026-01-15T10:00:00.000Z',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
    expect(
      (await payload.count({ collection: 'declarations', overrideAccess: true })).totalDocs,
    ).toBe(1)
  })

  it('derives cuttingTypeLabel and validUntil on every write', async () => {
    const payload = await getTestPayload()
    const doc = await payload.create({
      collection: 'declarations',
      data: {
        sourceId: 'forestusedeclaration.2',
        declarationNumber: '1-2026-3',
        cuttingTypeCode: 4,
        receivedAt: '2026-03-01T00:00:00.000Z',
        geomHash: 'g2',
        attrHash: 'a2',
        firstSeenAt: '2026-03-02T00:00:00.000Z',
        lastSeenAt: '2026-03-02T00:00:00.000Z',
      },
      overrideAccess: true,
    })
    expect(doc.cuttingTypeLabel).toBe('Avohakkuu')
    expect(doc.validUntil).toBe('2029-03-01T00:00:00.000Z')
    expect(doc.removedAt).toBeFalsy()

    const updated = await payload.update({
      collection: 'declarations',
      id: doc.id,
      data: { cuttingTypeCode: 2, receivedAt: '2026-04-01T00:00:00.000Z' },
      overrideAccess: true,
    })
    expect(updated.cuttingTypeLabel).toBe('Harvennus')
    expect(updated.validUntil).toBe('2029-04-01T00:00:00.000Z')
  })

  it('is admin read-only: admins read, users cannot, nobody writes through access control', async () => {
    const payload = await getTestPayload()

    const asAdmin = await payload.find({
      collection: 'declarations',
      user: admin,
      overrideAccess: false,
    })
    expect(asAdmin.totalDocs).toBe(2)
    await expect(
      payload.find({ collection: 'declarations', user, overrideAccess: false }),
    ).rejects.toThrow()

    const existing = asAdmin.docs[0]!
    await expect(
      payload.create({
        collection: 'declarations',
        data: {
          sourceId: 'forestusedeclaration.3',
          declarationNumber: '1-2026-4',
          geomHash: 'g3',
          attrHash: 'a3',
          firstSeenAt: '2026-03-02T00:00:00.000Z',
          lastSeenAt: '2026-03-02T00:00:00.000Z',
        },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'declarations',
        id: existing.id,
        data: { areaHa: 99 },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: 'declarations',
        id: existing.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(
      (await payload.count({ collection: 'declarations', overrideAccess: true })).totalDocs,
    ).toBe(2)
  })

  it('stores previous hashes in declaration_revisions, admin read-only as well', async () => {
    const payload = await getTestPayload()
    const declaration = await payload.find({
      collection: 'declarations',
      where: { sourceId: { equals: 'forestusedeclaration.2' } },
      overrideAccess: true,
    })
    const declarationId = declaration.docs[0]!.id

    const revision = await payload.create({
      collection: 'declaration-revisions',
      data: {
        declaration: declarationId,
        prevGeomHash: 'g2',
        prevAttrHash: 'a2',
        prevRawAttributes: { AREA: 1.5 },
        changedAt: '2026-05-01T00:00:00.000Z',
      },
      overrideAccess: true,
    })
    expect(revision.prevRawAttributes).toEqual({ AREA: 1.5 })

    const asAdmin = await payload.find({
      collection: 'declaration-revisions',
      user: admin,
      overrideAccess: false,
      depth: 1,
    })
    expect(asAdmin.totalDocs).toBe(1)
    expect((asAdmin.docs[0]!.declaration as { sourceId: string }).sourceId).toBe(
      'forestusedeclaration.2',
    )
    await expect(
      payload.find({ collection: 'declaration-revisions', user, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'declaration-revisions',
        data: { ...revision, id: undefined, declaration: declarationId },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    const db = await drizzle()
    const { rows } = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'declaration_revisions'
    `)
    expect(rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining([
        'declaration_revisions_declaration_idx',
        'declaration_revisions_changed_at_idx',
      ]),
    )
  })
})
