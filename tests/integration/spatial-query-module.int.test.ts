import type { Payload } from 'payload'
import { beforeEach, describe, expect, it } from 'vitest'

import { wfs } from '@/config/wfs'
import type { Bbox } from '@/lib/geo/buffer'
import {
  declarationsForWatchArea,
  markMissing,
  matchWatchAreas,
  previewCount,
  upsertDeclarations,
} from '@/lib/geo/spatial-queries'
import type { NormalisedDeclaration } from '@/lib/wfs/normalise'
import type { WatchArea } from '@/payload-types'
import {
  buildDeclaration,
  fixtureDeclarations,
  squareMultiPolygon,
} from '../factories/declarations'
import { createWatchArea } from '../factories/watch-areas'
import { SAMPLE_WATCH_AREA, SAMPLE_WATCH_AREA_CENTER_3067 } from '../fixtures/sample-area'
import manifest from '../fixtures/wfs/manifest.json'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

/** Pipeline runs at 09:30 / 21:30 Finnish time (`01 §2`); every fixture is in force on these days. */
const RUN_1 = new Date('2026-10-24T06:30:00.000Z')
const RUN_2 = new Date('2026-10-24T18:30:00.000Z')
const RUN_3 = new Date('2026-10-25T06:30:00.000Z')
const RUN_4 = new Date('2026-10-25T18:30:00.000Z')

const [CENTER_E, CENTER_N] = SAMPLE_WATCH_AREA_CENTER_3067
const REQUEST_BBOX = manifest.requestBbox as Bbox
/** A box in Rovaniemi, hundreds of km from the fixture area. */
const FAR_AWAY: [number, number] = [442_000, 7_375_000]

const ids = (rows: NormalisedDeclaration[]) => rows.map((d) => d.sourceId).sort()

describe('spatial query module (MV-037)', () => {
  let payload: Payload
  let area: WatchArea

  beforeEach(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    const owner = await createTestUser(payload)
    area = await createWatchArea(payload, owner.id)
  })

  async function declarationRows() {
    const { docs } = await payload.find({
      collection: 'declarations',
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    return new Map(docs.map((d) => [d.sourceId, d]))
  }

  async function sourceIdsOf(declarationIds: number[]): Promise<string[]> {
    const rows = await declarationRows()
    const byId = new Map([...rows.values()].map((d) => [d.id, d.sourceId]))
    return declarationIds.map((id) => byId.get(id)!).sort()
  }

  describe('matchWatchAreas()', () => {
    it('matches the inside and borderline fixtures, not the outside ones', async () => {
      const inside = fixtureDeclarations('inside')
      const borderline = fixtureDeclarations('borderline')
      await upsertDeclarations(
        payload,
        [...inside, ...borderline, ...fixtureDeclarations('outside')],
        RUN_1,
      )

      const matches = await matchWatchAreas(payload, RUN_1)

      expect(await sourceIdsOf(matches.map((m) => m.declarationId))).toEqual(
        ids([...inside, ...borderline]),
      )
      for (const m of matches) {
        expect(m.watchAreaId).toBe(area.id)
        expect(m.ownerId).toBe(typeof area.owner === 'object' ? area.owner.id : area.owner)
        expect(m.inserted).toBe(true)
        expect(m.lastSeenGeomHash).toBe(m.geomHash)
        expect(m.lastSeenAttrHash).toBe(m.attrHash)
        expect(m.distanceM).toBeGreaterThanOrEqual(0)
        expect(m.distanceM).toBeLessThan(SAMPLE_WATCH_AREA.radiusM)
        expect(m.cuttingTypeLabel).toEqual(expect.any(String))
        expect(m.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      }
      const joins = await payload.count({
        collection: 'watch-area-declarations',
        overrideAccess: true,
      })
      expect(joins.totalDocs).toBe(inside.length + borderline.length)
    })

    it('re-running with unchanged data inserts nothing and returns nothing', async () => {
      await upsertDeclarations(
        payload,
        [...fixtureDeclarations('inside'), ...fixtureDeclarations('borderline')],
        RUN_1,
      )
      const first = await matchWatchAreas(payload, RUN_1)

      expect(await matchWatchAreas(payload, RUN_2)).toEqual([])
      const joins = await payload.find({
        collection: 'watch-area-declarations',
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
      expect(joins.totalDocs).toBe(first.length)
      expect(new Set(joins.docs.map((j) => j.lastMatchedAt))).toEqual(
        new Set([RUN_2.toISOString()]),
      )
      expect(new Set(joins.docs.map((j) => j.firstMatchedAt))).toEqual(
        new Set([RUN_1.toISOString()]),
      )
    })

    it('distance is 0 for a polygon that covers the centre and reaches outside the circle', async () => {
      const covering = buildDeclaration('covering', SAMPLE_WATCH_AREA_CENTER_3067, {
        // 3 km square: the centre is inside it, most of it lies outside the 1 km circle.
        geometry: squareMultiPolygon(SAMPLE_WATCH_AREA_CENTER_3067, 1500),
      })
      // Nearest edge 600 m east of the centre, far edge 1 200 m: crosses the circle edge.
      const crossing = buildDeclaration('crossing', [CENTER_E + 900, CENTER_N], {
        geometry: squareMultiPolygon([CENTER_E + 900, CENTER_N], 300),
      })
      // Nearest edge 1 100 m from the centre: outside the 1 km circle.
      const outside = buildDeclaration('outside', [CENTER_E, CENTER_N - 1200], {
        geometry: squareMultiPolygon([CENTER_E, CENTER_N - 1200], 100),
      })
      await upsertDeclarations(payload, [covering, crossing, outside], RUN_1)

      const matches = await matchWatchAreas(payload, RUN_1)
      const rows = await declarationRows()
      const distance = (sourceId: string) =>
        matches.find((m) => m.declarationId === rows.get(sourceId)!.id)?.distanceM

      expect(matches).toHaveLength(2)
      expect(distance('covering')).toBe(0)
      expect(distance('crossing')).toBeCloseTo(600, 3)
      expect(distance('outside')).toBeUndefined()
    })

    it('returns an existing pair whose declaration changed, with the stored hashes', async () => {
      await upsertDeclarations(payload, fixtureDeclarations('inside'), RUN_1)
      await matchWatchAreas(payload, RUN_1)

      await upsertDeclarations(payload, fixtureDeclarations('changed-geometry'), RUN_2)
      const changed = await matchWatchAreas(payload, RUN_2)

      expect(changed).toHaveLength(1)
      const [m] = changed
      expect(await sourceIdsOf([m!.declarationId])).toEqual([
        manifest.fixtures['changed-geometry'].changedId,
      ])
      expect(m!.inserted).toBe(false)
      expect(m!.lastSeenGeomHash).not.toBe(m!.geomHash)
      expect(m!.lastSeenAttrHash).toBe(m!.attrHash)

      // The caller stores the new hashes after alerting; then the pair is quiet again.
      await payload.update({
        collection: 'watch-area-declarations',
        id: m!.watchAreaDeclarationId,
        data: { lastSeenGeomHash: m!.geomHash },
        overrideAccess: true,
      })
      expect(await matchWatchAreas(payload, RUN_3)).toEqual([])
    })

    it('skips removed and expired declarations', async () => {
      const expired = buildDeclaration('expired', SAMPLE_WATCH_AREA_CENTER_3067, {
        receivedAt: '2023-06-01T09:00:00.000Z', // valid until 2026-06-01
      })
      const removed = buildDeclaration('removed', [CENTER_E + 200, CENTER_N])
      await upsertDeclarations(payload, [expired, removed], RUN_1)
      for (const run of [RUN_2, RUN_3, RUN_4]) await markMissing(payload, REQUEST_BBOX, [], run)

      expect((await declarationRows()).get('removed')!.removedAt).toBe(RUN_4.toISOString())
      expect(await matchWatchAreas(payload, RUN_4)).toEqual([])
    })
  })

  describe('upsertDeclarations()', () => {
    it('inserts new rows with their geometry, then only bumps lastSeenAt for unchanged ones', async () => {
      const inside = fixtureDeclarations('inside')

      expect(await upsertDeclarations(payload, inside, RUN_1)).toEqual({
        inserted: inside.length,
        updated: 0,
        unchanged: 0,
      })
      const first = await declarationRows()
      const sample = first.get(inside[0]!.sourceId)!
      expect(sample).toMatchObject({
        declarationNumber: inside[0]!.declarationNumber,
        cuttingTypeCode: inside[0]!.cuttingTypeCode,
        cuttingTypeLabel: inside[0]!.cuttingTypeLabel,
        geomHash: inside[0]!.geomHash,
        attrHash: inside[0]!.attrHash,
        receivedAt: inside[0]!.receivedAt,
        validUntil: inside[0]!.validUntil,
        firstSeenAt: RUN_1.toISOString(),
        lastSeenAt: RUN_1.toISOString(),
        missingRuns: 0,
        removedAt: null,
      })
      expect(sample.rawAttributes).toEqual(inside[0]!.rawAttributes)
      const map = await declarationsForWatchArea(payload, area.id, RUN_1)
      expect(map.features).toHaveLength(inside.length)

      expect(await upsertDeclarations(payload, inside, RUN_2)).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: inside.length,
      })
      const second = await declarationRows()
      for (const d of inside) {
        expect(second.get(d.sourceId)).toMatchObject({
          id: first.get(d.sourceId)!.id,
          firstSeenAt: RUN_1.toISOString(),
          lastSeenAt: RUN_2.toISOString(),
        })
      }
      const revisions = await payload.count({
        collection: 'declaration-revisions',
        overrideAccess: true,
      })
      expect(revisions.totalDocs).toBe(0)
    })

    it('a changed geometry or attribute updates the row and writes one revision', async () => {
      const inside = fixtureDeclarations('inside')
      const changedId = manifest.fixtures['changed-geometry'].changedId
      const original = inside.find((d) => d.sourceId === changedId)!
      await upsertDeclarations(payload, inside, RUN_1)

      const westEdge = async () => {
        const { features } = await declarationsForWatchArea(payload, area.id, RUN_2)
        const feature = features.find((f) => f.properties.sourceId === changedId)!
        return Math.min(...feature.geometry.coordinates.flat(2).map(([lng]) => lng!))
      }
      const westEdgeBefore = await westEdge()

      const movedGeometry = fixtureDeclarations('changed-geometry')
      expect(await upsertDeclarations(payload, movedGeometry, RUN_2)).toEqual({
        inserted: 0,
        updated: 1,
        unchanged: inside.length - 1,
      })
      const moved = movedGeometry.find((d) => d.sourceId === changedId)!
      expect((await declarationRows()).get(changedId)!.geomHash).toBe(moved.geomHash)
      // The stored polygon moved 5 m east with the feature (≈ 0.00009° of longitude here).
      expect((await westEdge()) - westEdgeBefore).toBeCloseTo(0.00009, 5)

      const newAttributes = fixtureDeclarations('changed-attributes')
      expect(await upsertDeclarations(payload, newAttributes, RUN_3)).toEqual({
        inserted: 0,
        updated: 1,
        unchanged: inside.length - 1,
      })
      const recoded = newAttributes.find((d) => d.sourceId === changedId)!
      expect((await declarationRows()).get(changedId)).toMatchObject({
        cuttingTypeCode: recoded.cuttingTypeCode,
        cuttingTypeLabel: recoded.cuttingTypeLabel,
        attrHash: recoded.attrHash,
        geomHash: recoded.geomHash,
        firstSeenAt: RUN_1.toISOString(),
        lastSeenAt: RUN_3.toISOString(),
      })

      const { docs: revisions } = await payload.find({
        collection: 'declaration-revisions',
        sort: 'changedAt',
        overrideAccess: true,
      })
      expect(revisions.map((r) => [r.prevGeomHash, r.prevAttrHash, r.changedAt])).toEqual([
        [original.geomHash, original.attrHash, RUN_2.toISOString()],
        [moved.geomHash, original.attrHash, RUN_3.toISOString()],
      ])
      expect(revisions[0]!.prevRawAttributes).toEqual(original.rawAttributes)
    })

    it('writes a sourceId repeated within the batch once, and batches above the statement size', async () => {
      const many = Array.from({ length: wfs.upsertBatchSize + 1 }, (_, i) =>
        buildDeclaration(`bulk-${i}`, [FAR_AWAY[0] + i * 200, FAR_AWAY[1]]),
      )
      const duplicate = buildDeclaration('bulk-0', FAR_AWAY, { areaHa: 9 })

      expect(await upsertDeclarations(payload, [...many, duplicate], RUN_1)).toEqual({
        inserted: many.length,
        updated: 0,
        unchanged: 0,
      })
      const rows = await declarationRows()
      expect(rows.size).toBe(many.length)
      expect(rows.get('bulk-0')!.areaHa).toBe(9)
    })
  })

  describe('markMissing()', () => {
    it('removes a declaration missing from its bbox on three consecutive runs', async () => {
      const inside = fixtureDeclarations('inside')
      const borderline = fixtureDeclarations('borderline')
      const elsewhere = buildDeclaration('elsewhere', FAR_AWAY)
      await upsertDeclarations(payload, [...inside, ...borderline, elsewhere], RUN_1)
      const seen = inside.map((d) => d.sourceId)

      expect(await markMissing(payload, REQUEST_BBOX, seen, RUN_2)).toEqual({
        missed: borderline.length,
        removed: 0,
      })
      // A second (overlapping) bbox of the same run does not count the same row again.
      expect(await markMissing(payload, REQUEST_BBOX, seen, RUN_2)).toEqual({
        missed: 0,
        removed: 0,
      })
      expect(await markMissing(payload, REQUEST_BBOX, seen, RUN_3)).toEqual({
        missed: borderline.length,
        removed: 0,
      })
      expect(await markMissing(payload, REQUEST_BBOX, seen, RUN_4)).toEqual({
        missed: borderline.length,
        removed: borderline.length,
      })

      const rows = await declarationRows()
      for (const d of borderline) {
        expect(rows.get(d.sourceId)).toMatchObject({
          missingRuns: 3,
          removedAt: RUN_4.toISOString(),
        })
      }
      for (const d of inside) {
        expect(rows.get(d.sourceId)).toMatchObject({ missingRuns: 0, removedAt: null })
      }
      expect(rows.get('elsewhere')).toMatchObject({ missingRuns: 0, removedAt: null })
      // Removed rows are not counted any further.
      expect(
        await markMissing(payload, REQUEST_BBOX, seen, new Date('2026-10-26T06:30:00Z')),
      ).toEqual({ missed: 0, removed: 0 })
    })

    it('a sighting resets the count, and a removed declaration that reappears is restored', async () => {
      const borderline = fixtureDeclarations('borderline')
      await upsertDeclarations(payload, borderline, RUN_1)
      await markMissing(payload, REQUEST_BBOX, [], RUN_2)
      await markMissing(payload, REQUEST_BBOX, [], RUN_3)

      await upsertDeclarations(payload, borderline, RUN_4)
      const rows = await declarationRows()
      for (const d of borderline) {
        expect(rows.get(d.sourceId)).toMatchObject({ missingRuns: 0, removedAt: null })
      }

      const later = [6, 7, 8].map((day) => new Date(`2026-10-2${day}T06:30:00.000Z`))
      for (const run of later) await markMissing(payload, REQUEST_BBOX, [], run)
      expect([...(await declarationRows()).values()].every((d) => d.removedAt !== null)).toBe(true)

      await upsertDeclarations(payload, borderline, new Date('2026-10-29T06:30:00.000Z'))
      expect([...(await declarationRows()).values()].every((d) => d.removedAt === null)).toBe(true)
    })
  })

  describe('declarationsForWatchArea()', () => {
    it('returns the matching declarations as WGS 84 GeoJSON, newest first', async () => {
      const inside = fixtureDeclarations('inside')
      const borderline = fixtureDeclarations('borderline')
      const expired = buildDeclaration('expired', SAMPLE_WATCH_AREA_CENTER_3067, {
        receivedAt: '2023-06-01T09:00:00.000Z',
      })
      await upsertDeclarations(
        payload,
        [...inside, ...borderline, ...fixtureDeclarations('outside'), expired],
        RUN_1,
      )

      const fc = await declarationsForWatchArea(payload, area.id, RUN_1)

      expect(fc.type).toBe('FeatureCollection')
      expect(fc.features.map((f) => f.properties.sourceId).sort()).toEqual(
        ids([...inside, ...borderline]),
      )
      const received = fc.features.map((f) => f.properties.receivedAt!)
      expect(received).toEqual([...received].sort().reverse())
      const rows = await declarationRows()
      for (const f of fc.features) {
        const row = rows.get(f.properties.sourceId)!
        expect(f.id).toBe(row.id)
        expect(f.geometry.type).toBe('MultiPolygon')
        for (const [lng, lat] of f.geometry.coordinates.flat(2)) {
          expect(lng).toBeCloseTo(SAMPLE_WATCH_AREA.center.lng, 1)
          expect(lat).toBeCloseTo(SAMPLE_WATCH_AREA.center.lat, 1)
        }
        expect(f.properties).toMatchObject({
          declarationNumber: row.declarationNumber,
          cuttingTypeCode: row.cuttingTypeCode,
          cuttingTypeLabel: row.cuttingTypeLabel,
          areaHa: row.areaHa,
          receivedAt: row.receivedAt,
          validUntil: row.validUntil,
        })
        expect(f.properties.distanceM).toBeLessThan(SAMPLE_WATCH_AREA.radiusM)
      }
    })
  })

  describe('previewCount()', () => {
    it('counts what a watch area with that centre and radius would match', async () => {
      const inside = fixtureDeclarations('inside')
      const borderline = fixtureDeclarations('borderline')
      const removed = buildDeclaration('removed', SAMPLE_WATCH_AREA_CENTER_3067)
      await upsertDeclarations(
        payload,
        [...inside, ...borderline, ...fixtureDeclarations('outside'), removed],
        RUN_1,
      )
      await payload.update({
        collection: 'declarations',
        where: { sourceId: { equals: 'removed' } },
        data: { removedAt: RUN_1.toISOString() },
        overrideAccess: true,
      })
      const center: [number, number] = [SAMPLE_WATCH_AREA.center.lng, SAMPLE_WATCH_AREA.center.lat]

      expect(await previewCount(payload, center, SAMPLE_WATCH_AREA.radiusM, RUN_1)).toBe(
        inside.length + borderline.length,
      )
      const matched = await matchWatchAreas(payload, RUN_1)
      expect(await previewCount(payload, center, SAMPLE_WATCH_AREA.radiusM, RUN_1)).toBe(
        matched.length,
      )
      expect(await previewCount(payload, [25.72, 66.5], 5000, RUN_1)).toBe(0)
    })
  })
})
