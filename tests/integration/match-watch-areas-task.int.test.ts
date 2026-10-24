import type { Payload } from 'payload'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Bbox } from '@/lib/geo/buffer'
import { markMissing, upsertDeclarations } from '@/lib/geo/spatial-queries'
import { createJobContext } from '@/lib/jobs/context'
import { withJobRun } from '@/lib/jobs/job-runs'
import { type MatchWatchAreasOptions, matchWatchAreas } from '@/lib/jobs/match-watch-areas'
import { alertSnapshot } from '@/payload/collections/Alerts'
import type { Alert, WatchArea } from '@/payload-types'
import { fixtureDeclarations } from '../factories/declarations'
import { createWatchArea } from '../factories/watch-areas'
import manifest from '../fixtures/wfs/manifest.json'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

/** Pipeline runs at 09:30 / 21:30 Finnish time (`01 §2`); every fixture is in force on these days. */
const RUN_1 = new Date('2026-10-24T06:30:00.000Z')
const RUN_2 = new Date('2026-10-24T18:30:00.000Z')
const RUN_3 = new Date('2026-10-25T06:30:00.000Z')
const RUN_4 = new Date('2026-10-25T18:30:00.000Z')
const RUN_5 = new Date('2026-10-26T06:30:00.000Z')

const REQUEST_BBOX = manifest.requestBbox as Bbox
const CHANGED_ID = manifest.fixtures['changed-geometry'].changedId
const { inside, borderline, outside } = manifest.fixtures
const MATCHING_IDS = [...inside.ids, ...borderline.ids].sort()

/**
 * MV-072 (`01 §4.2`): the `match-watch-areas` step against the recorded Sipoo fixture set
 * (6 stands inside the 1 km circle, 4 crossing its edge, 9 outside), with the declarations
 * written by `upsertDeclarations()` as `fetch-declarations` writes them.
 */
describe('match-watch-areas task (MV-072)', () => {
  let payload: Payload
  let ownerId: number
  let area: WatchArea

  beforeEach(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    ownerId = (await createTestUser(payload)).id
    area = await createWatchArea(payload, ownerId)
    await upsertDeclarations(
      payload,
      [
        ...fixtureDeclarations('inside'),
        ...fixtureDeclarations('borderline'),
        ...fixtureDeclarations('outside'),
      ],
      RUN_1,
    )
  })

  function runAt(now: Date, options?: MatchWatchAreasOptions) {
    return matchWatchAreas({ ...createJobContext(payload, 'match-test'), now: () => now }, options)
  }

  async function alerts(): Promise<(Alert & { sourceId: string })[]> {
    const { docs } = await payload.find({
      collection: 'alerts',
      depth: 1,
      limit: 0,
      pagination: false,
      sort: 'id',
      overrideAccess: true,
    })
    return docs.map((a) => ({
      ...a,
      sourceId: (a.declaration as { sourceId: string }).sourceId,
    }))
  }

  async function watchArea(id = area.id) {
    return payload.findByID({ collection: 'watch-areas', id, overrideAccess: true })
  }

  it('alerts each inside and borderline stand once as new, nothing outside, with a snapshot', async () => {
    const result = await runAt(RUN_1)

    expect(result).toEqual({
      watchAreas: 1,
      matched: MATCHING_IDS.length,
      alertsCreated: MATCHING_IDS.length,
      new: MATCHING_IDS.length,
      geometryChanged: 0,
      attributesChanged: 0,
      removed: 0,
    })
    const created = await alerts()
    expect(created.map((a) => a.sourceId).sort()).toEqual(MATCHING_IDS)
    for (const id of outside.ids) expect(created.some((a) => a.sourceId === id)).toBe(false)

    const byId = new Map(
      [...fixtureDeclarations('inside'), ...fixtureDeclarations('borderline')].map((d) => [
        d.sourceId,
        d,
      ]),
    )
    for (const a of created) {
      const declaration = byId.get(a.sourceId)!
      expect(a).toMatchObject({
        changeType: 'new',
        user: { id: ownerId },
        watchArea: { id: area.id },
        notifiedAt: null,
        readAt: null,
      })
      const snapshot = alertSnapshot(a)
      expect(snapshot).toMatchObject({
        cuttingTypeLabel: declaration.cuttingTypeLabel,
        areaHa: declaration.areaHa,
        receivedAt: new Date(declaration.receivedAt!).toISOString(),
      })
      expect(snapshot.distanceM).toBeGreaterThanOrEqual(0)
      expect(snapshot.distanceM).toBeLessThan(1000)
      expect(Number.isInteger(snapshot.distanceM)).toBe(true)
    }

    expect(await watchArea()).toMatchObject({
      lastCheckedAt: RUN_1.toISOString(),
      lastDeclarationCount: MATCHING_IDS.length,
    })
  })

  it('a re-run with unchanged data creates no alerts and only moves lastCheckedAt', async () => {
    await runAt(RUN_1)
    const result = await runAt(RUN_2)

    expect(result).toMatchObject({ matched: MATCHING_IDS.length, alertsCreated: 0, new: 0 })
    expect(await alerts()).toHaveLength(MATCHING_IDS.length)
    expect(await watchArea()).toMatchObject({
      lastCheckedAt: RUN_2.toISOString(),
      lastDeclarationCount: MATCHING_IDS.length,
    })
  })

  it('a geometry change alerts geometry_changed once and stores the new hash', async () => {
    await runAt(RUN_1)
    await upsertDeclarations(payload, fixtureDeclarations('changed-geometry'), RUN_2)

    expect(await runAt(RUN_2)).toMatchObject({ alertsCreated: 1, geometryChanged: 1 })
    const latest = (await alerts()).at(-1)!
    expect(latest).toMatchObject({ sourceId: CHANGED_ID, changeType: 'geometry_changed' })

    const { docs: joins } = await payload.find({
      collection: 'watch-area-declarations',
      where: { 'declaration.sourceId': { equals: CHANGED_ID } },
      depth: 1,
      overrideAccess: true,
    })
    expect(joins).toHaveLength(1)
    const declaration = joins[0]!.declaration as { geomHash: string; attrHash: string }
    expect(joins[0]).toMatchObject({
      lastSeenGeomHash: declaration.geomHash,
      lastSeenAttrHash: declaration.attrHash,
      lastMatchedAt: RUN_2.toISOString(),
      firstMatchedAt: RUN_1.toISOString(),
    })

    expect(await runAt(RUN_3)).toMatchObject({ alertsCreated: 0 })
    expect(await alerts()).toHaveLength(MATCHING_IDS.length + 1)
  })

  it('an attribute-only change alerts attributes_changed once', async () => {
    await runAt(RUN_1)
    await upsertDeclarations(payload, fixtureDeclarations('changed-attributes'), RUN_2)

    expect(await runAt(RUN_2)).toMatchObject({
      alertsCreated: 1,
      geometryChanged: 0,
      attributesChanged: 1,
    })
    expect((await alerts()).at(-1)).toMatchObject({
      sourceId: CHANGED_ID,
      changeType: 'attributes_changed',
    })
    expect(await runAt(RUN_3)).toMatchObject({ alertsCreated: 0 })
  })

  it('a grown radius alerts the newly covered stands on the next run, the old ones stay quiet', async () => {
    await runAt(RUN_1)
    // Every stand of the padded request box lies within ~2.1 km of the centre.
    await payload.update({
      collection: 'watch-areas',
      id: area.id,
      data: { radiusM: 2500 },
      overrideAccess: true,
    })

    const result = await runAt(RUN_2)

    expect(result).toMatchObject({
      matched: MATCHING_IDS.length + outside.ids.length,
      alertsCreated: outside.ids.length,
      new: outside.ids.length,
    })
    const latest = (await alerts()).slice(MATCHING_IDS.length)
    expect(latest.map((a) => a.sourceId).sort()).toEqual([...outside.ids].sort())
    expect(await watchArea()).toMatchObject({
      lastDeclarationCount: MATCHING_IDS.length + outside.ids.length,
    })
  })

  async function removeStand(sourceId: string) {
    const kept = [
      ...fixtureDeclarations('inside'),
      ...fixtureDeclarations('borderline'),
      ...fixtureDeclarations('outside'),
    ].filter((d) => d.sourceId !== sourceId)
    for (const run of [RUN_2, RUN_3, RUN_4]) {
      await upsertDeclarations(payload, kept, run)
      await markMissing(
        payload,
        REQUEST_BBOX,
        kept.map((d) => d.sourceId),
        run,
      )
    }
  }

  it('with ALERT_ON_REMOVED a matched stand that was removed alerts removed once', async () => {
    const removedId = inside.ids[0]!
    await runAt(RUN_1, { alertOnRemoved: true })
    await removeStand(removedId)

    const result = await runAt(RUN_4, { alertOnRemoved: true })

    expect(result).toMatchObject({
      matched: MATCHING_IDS.length - 1,
      alertsCreated: 1,
      new: 0,
      removed: 1,
    })
    const latest = (await alerts()).at(-1)!
    expect(latest).toMatchObject({ sourceId: removedId, changeType: 'removed' })
    const first = (await alerts()).find((a) => a.sourceId === removedId)!
    expect(alertSnapshot(latest).distanceM).toBe(alertSnapshot(first).distanceM)
    expect(await watchArea()).toMatchObject({ lastDeclarationCount: MATCHING_IDS.length - 1 })

    expect(await runAt(RUN_5, { alertOnRemoved: true })).toMatchObject({ removed: 0 })
    expect(await alerts()).toHaveLength(MATCHING_IDS.length + 1)
  })

  it('without ALERT_ON_REMOVED a removal is never alerted, not even once the flag is turned on', async () => {
    await runAt(RUN_1)
    await removeStand(inside.ids[0]!)

    expect(await runAt(RUN_4)).toMatchObject({ alertsCreated: 0, removed: 0 })
    expect(await runAt(RUN_5, { alertOnRemoved: true })).toMatchObject({ removed: 0 })
    expect(await alerts()).toHaveLength(MATCHING_IDS.length)
  })

  it('skips the areas of an account being deleted', async () => {
    await payload.update({
      collection: 'users',
      id: ownerId,
      data: { deletedAt: RUN_1.toISOString() },
      overrideAccess: true,
    })

    expect(await runAt(RUN_1)).toMatchObject({ watchAreas: 0, matched: 0, alertsCreated: 0 })
    expect(await alerts()).toHaveLength(0)
    expect(await watchArea()).toMatchObject({ lastCheckedAt: null })
  })

  it('a failing run rolls back every pair it recorded, so its retry alerts them', async () => {
    const ctx = { ...createJobContext(payload, 'match-rollback'), now: () => RUN_1 }
    let creates = 0
    const failing = new Proxy(payload, {
      get(target, prop, receiver) {
        if (prop !== 'create') return Reflect.get(target, prop, receiver)
        return (...args: Parameters<Payload['create']>) => {
          creates += 1
          if (creates === 3) throw new Error('database went away')
          return target.create(...args)
        }
      },
    })

    await expect(matchWatchAreas({ ...ctx, payload: failing })).rejects.toThrow(
      'database went away',
    )
    expect(await alerts()).toHaveLength(0)
    expect(
      (await payload.count({ collection: 'watch-area-declarations', overrideAccess: true }))
        .totalDocs,
    ).toBe(0)
    expect(await watchArea()).toMatchObject({ lastCheckedAt: null })

    expect(await matchWatchAreas(ctx)).toMatchObject({ new: MATCHING_IDS.length })
  })

  it('records its counters in job_runs', async () => {
    const ctx = { ...createJobContext(payload, 'match-job-run'), now: () => RUN_1 }
    await withJobRun(ctx, 'match-watch-areas', () => matchWatchAreas(ctx))

    const { docs } = await payload.find({
      collection: 'job-runs',
      where: { task: { equals: 'match-watch-areas' } },
      overrideAccess: true,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({
      status: 'succeeded',
      stats: { watchAreas: 1, matched: MATCHING_IDS.length, new: MATCHING_IDS.length },
    })
  })
})
