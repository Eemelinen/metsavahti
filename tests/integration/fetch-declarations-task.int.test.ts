import { HttpResponse, http } from 'msw'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Bbox } from '@/lib/geo/buffer'
import { type LonLat, to3067 } from '@/lib/geo/crs'
import { upsertDeclarations } from '@/lib/geo/spatial-queries'
import { createJobContext } from '@/lib/jobs/context'
import { fetchDeclarations, fetchDeclarationsStatus } from '@/lib/jobs/fetch-declarations'
import { withJobRun } from '@/lib/jobs/job-runs'
import type { DeclarationFeatureCollection } from '@/lib/wfs/schemas'
import type { JobRun } from '@/payload-types'
import { buildDeclaration } from '../factories/declarations'
import { createWatchArea } from '../factories/watch-areas'
import manifest from '../fixtures/wfs/manifest.json'
import { server } from '../helpers/msw'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'
import {
  bboxesIntersect,
  loadWfsFixture,
  requestBbox,
  wfsResponseForBbox,
} from '../helpers/wfs-fixture'

const WFS_URL = 'http://wfs.test/rajapinnat/v1/ows/'
/** The padded box of `SAMPLE_WATCH_AREA` (`bboxForWatchArea`), as the fixtures were recorded. */
const SIPOO_BOX = manifest.requestBbox as Bbox
const ROVANIEMI: LonLat = [25.72, 66.5]
const OULU: LonLat = [25.47, 65.01]
const CHANGED_ID = manifest.fixtures['changed-geometry'].changedId
/** An `inside` stand that is not the changed one; it disappears from the WFS below. */
const VANISHING_ID = manifest.fixtures.inside.ids[0]!

function collection(...names: string[]): DeclarationFeatureCollection {
  const sets = names.map((name) => loadWfsFixture(`${name}.json`))
  const features = sets.flatMap((fc) => fc.features)
  return { ...sets[0]!, features, numberReturned: features.length }
}

/**
 * MV-071 (`01 §4.1`): the `fetch-declarations` task against an msw WFS that serves the
 * recorded Sipoo fixture set (19 stands) for any box touching it. The cases run in order on
 * one database, like successive pipeline runs.
 */
describe('fetch-declarations task (MV-071)', () => {
  let payload: Payload
  let ownerId: number
  /** What the WFS answers for the Sipoo box. */
  let served: DeclarationFeatureCollection
  /** Boxes the WFS answers with 503. */
  let failing: Bbox[] = []
  /** The bbox of every GetFeature request, retries included. */
  let requests: Bbox[] = []

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' })
    server.use(
      http.get(WFS_URL, ({ request }) => {
        const bbox = requestBbox(new URL(request.url).searchParams)!
        requests.push(bbox)
        if (failing.some((box) => bboxesIntersect(box, bbox))) {
          return new HttpResponse('Service Unavailable', { status: 503 })
        }
        return HttpResponse.json(wfsResponseForBbox(served, bbox))
      }),
    )
    payload = await getTestPayload()
    await resetDatabase(payload)
    const owner = await createTestUser(payload)
    ownerId = owner.id
    await createWatchArea(payload, ownerId)

    // An account being deleted (MV-094) keeps its rows until the job runs; its areas are skipped.
    const leaving = await createTestUser(payload)
    await createWatchArea(payload, leaving.id, { name: 'Oulu', center: OULU })
    await payload.update({
      collection: 'users',
      id: leaving.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    })
  })

  afterAll(() => server.close())

  async function runTask(): Promise<JobRun> {
    requests = []
    const job = await payload.jobs.queue({ task: 'fetch-declarations', input: {} })
    await payload.jobs.run({ allQueues: true })
    const { docs } = await payload.find({
      collection: 'job-runs',
      where: { runId: { equals: String(job.id) } },
      overrideAccess: true,
    })
    expect(docs).toHaveLength(1)
    return docs[0]!
  }

  /** The run's one `now` lies between the `job_runs` row's start and finish. */
  function duringRun(run: JobRun) {
    return expect.toSatisfy(
      (at: string | null | undefined) =>
        typeof at === 'string' && at >= run.startedAt && at <= run.finishedAt!,
      `a time during the run`,
    )
  }

  async function declarations() {
    const { docs } = await payload.find({
      collection: 'declarations',
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    return new Map(docs.map((d) => [d.sourceId, d]))
  }

  it('inserts every stand of the clustered box and skips areas of deleted accounts', async () => {
    served = collection('inside', 'borderline', 'outside')
    const run = await runTask()

    expect(run.status).toBe('succeeded')
    expect(run.stats).toEqual({
      watchAreas: 1,
      bboxes: 1,
      failedBboxes: 0,
      requests: 1,
      features: 19,
      inserted: 19,
      updated: 0,
      removed: 0,
    })
    expect(requests.map((box) => box.map(Math.round))).toEqual([SIPOO_BOX.map(Math.round)])
    const rows = await declarations()
    expect([...rows.keys()].sort()).toEqual(served.features.map((f) => f.id).sort())
    const seenAt = new Set([...rows.values()].map((row) => row.lastSeenAt))
    expect(seenAt.size).toBe(1)
    expect([...seenAt][0]).toEqual(duringRun(run))
    for (const row of rows.values()) expect(row).toMatchObject({ missingRuns: 0, removedAt: null })
    expect((await payload.count({ collection: 'declaration-revisions' })).totalDocs).toBe(0)
  })

  it('writes nothing new when the data has not changed', async () => {
    const run = await runTask()
    expect(run.stats).toMatchObject({ features: 19, inserted: 0, updated: 0, removed: 0 })
    expect((await payload.count({ collection: 'declaration-revisions' })).totalDocs).toBe(0)
  })

  it('keeps the previous hashes as a revision when a geometry changes', async () => {
    const before = (await declarations()).get(CHANGED_ID)!
    served = collection('changed-geometry', 'borderline', 'outside')
    const run = await runTask()

    expect(run.status).toBe('succeeded')
    expect(run.stats).toMatchObject({ features: 19, inserted: 0, updated: 1, removed: 0 })
    const after = (await declarations()).get(CHANGED_ID)!
    expect(after.geomHash).not.toBe(before.geomHash)
    expect(after.attrHash).toBe(before.attrHash)

    const { docs: revisions } = await payload.find({
      collection: 'declaration-revisions',
      depth: 0,
      overrideAccess: true,
    })
    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({
      declaration: after.id,
      prevGeomHash: before.geomHash,
      prevAttrHash: before.attrHash,
    })
  })

  it('removes a stand after it has been missing from its box on three consecutive runs', async () => {
    served = collection('changed-geometry', 'borderline', 'outside')
    served.features = served.features.filter((f) => f.id !== VANISHING_ID)
    served.numberReturned = served.features.length

    for (const missingRuns of [1, 2]) {
      const run = await runTask()
      expect(run.status).toBe('succeeded')
      expect(run.stats).toMatchObject({ features: 18, inserted: 0, updated: 0, removed: 0 })
      expect((await declarations()).get(VANISHING_ID)).toMatchObject({
        missingRuns,
        removedAt: null,
      })
    }

    const third = await runTask()
    expect(third.stats).toMatchObject({ features: 18, inserted: 0, updated: 0, removed: 1 })
    const rows = await declarations()
    expect(rows.get(VANISHING_ID)).toMatchObject({ missingRuns: 3, removedAt: duringRun(third) })
    const others = [...rows.values()].filter((row) => row.sourceId !== VANISHING_ID)
    expect(others).toHaveLength(18)
    for (const row of others) expect(row).toMatchObject({ missingRuns: 0, removedAt: null })
  })

  it('isolates a failing box: the others are stored, its stands are not counted missing, status partial', async () => {
    const rovaniemiArea = await createWatchArea(payload, ownerId, {
      name: 'Rovaniemi',
      center: ROVANIEMI,
    })
    const far = buildDeclaration('forestusedeclaration.900000001', to3067(ROVANIEMI))
    await upsertDeclarations(payload, [far], new Date('2026-10-24T06:30:00.000Z'))
    failing = [[...to3067(ROVANIEMI), ...to3067(ROVANIEMI)] as Bbox]

    try {
      const run = await runTask()

      expect(run.status).toBe('partial')
      expect(run.error ?? null).toBeNull()
      // The failing box answered 503 four times (the client's three retries), counted once.
      expect(run.stats).toEqual({
        watchAreas: 2,
        bboxes: 2,
        failedBboxes: 1,
        requests: 2,
        features: 18,
        inserted: 0,
        updated: 0,
        removed: 0,
      })
      expect(requests.filter((box) => bboxesIntersect(box, failing[0]!))).toHaveLength(4)

      const rows = await declarations()
      // The Sipoo box was stored in this run …
      expect(rows.get(CHANGED_ID)!.lastSeenAt).toEqual(duringRun(run))
      // … while the declaration stored in the failed Rovaniemi box kept its counter.
      expect(rows.get(far.sourceId)).toMatchObject({ missingRuns: 0, removedAt: null })
    } finally {
      failing = []
      await payload.delete({
        collection: 'watch-areas',
        id: rovaniemiArea.id,
        overrideAccess: true,
      })
    }
  })

  it('fails the step when every box fails', async () => {
    failing = [SIPOO_BOX]
    const ctx = createJobContext(payload, 'fetch-all-failed')
    try {
      await expect(
        withJobRun(
          ctx,
          'fetch-declarations',
          () => fetchDeclarations(ctx),
          fetchDeclarationsStatus,
        ),
      ).rejects.toThrow(/all 1 request boxes failed; last: .*503/)
    } finally {
      failing = []
    }
    const { docs } = await payload.find({
      collection: 'job-runs',
      where: { runId: { equals: 'fetch-all-failed' } },
      overrideAccess: true,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/503/) })
  })
})
