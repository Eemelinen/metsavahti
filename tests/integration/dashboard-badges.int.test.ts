import { revalidateTag, unstable_cache } from 'next/cache'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BADGE_CACHE_SECONDS,
  cachedUnreadAlertCount,
  revalidateAlertBadges,
} from '@/lib/alerts/badge'
import { countUnreadAlerts } from '@/lib/alerts/unread'
import { toWgs84 } from '@/lib/geo/crs'
import { createJobContext } from '@/lib/jobs/context'
import type { FetchDeclarationsResult } from '@/lib/jobs/fetch-declarations'
import type { MatchWatchAreasResult } from '@/lib/jobs/match-watch-areas'
import { type PipelineSteps, runPipeline } from '@/lib/jobs/pipeline'
import type { SendAlertsResult } from '@/lib/jobs/send-alerts'
import { loadWatchAreaDashboard } from '@/lib/watch-areas/dashboard'
import type { AlertChangeType } from '@/payload/collections/Alerts'
import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

// `next/cache` is the shared mock of `tests/integration/setup.ts`: `unstable_cache` runs the
// function uncached; the test checks the key and tags it was given and the tags revalidated.

const CENTER = toWgs84([435050, 6900050])
const HOUR_MS = 60 * 60 * 1000

const fetched: FetchDeclarationsResult = {
  watchAreas: 3,
  bboxes: 1,
  failedBboxes: 0,
  requests: 1,
  features: 1,
  inserted: 0,
  updated: 0,
  removed: 0,
}
const matched: MatchWatchAreasResult = {
  watchAreas: 3,
  matched: 1,
  alertsCreated: 3,
  new: 3,
  geometryChanged: 0,
  attributesChanged: 0,
  removed: 0,
}
const sent: SendAlertsResult = {
  emailsSent: 0,
  emailsFailed: 0,
  alertsHandled: 0,
  alertsDeferred: 0,
  alertsGivenUp: 0,
}

/**
 * MV-083 (absorbed MV-087): the counts on `/vahtialueet` and the nav badge come from the same
 * unread alerts the feed shows (`removed` stays hidden while `ALERT_ON_REMOVED` is off, as in
 * `.env.test`); the status strip reads the last succeeded `pipeline` run of `job_runs` and
 * warns once it is older than 14 h; the badge's count is cached under `alerts:<userId>`, which
 * a pipeline run expires for every account it alerted. (The Server Actions that change an
 * account's alerts expire its tag with `updateTag()`: `alert-feed.int.test.ts`,
 * `watch-area-server-actions.int.test.ts`.)
 */
describe('dashboard badges, status strip and badge revalidation (MV-083)', () => {
  let anna: User
  let ben: User
  let carl: User
  let annasArea: number
  let annasOtherArea: number
  let bensArea: number
  let carlsArea: number
  let declaration: number

  async function area(owner: User, name: string) {
    const payload = await getTestPayload()
    const doc = await payload.create({
      collection: 'watch-areas',
      data: { name, center: CENTER, radiusM: 500, owner: owner.id },
      overrideAccess: true,
    })
    return doc.id
  }

  async function alert(
    owner: User,
    watchArea: number,
    changeType: AlertChangeType = 'new',
    readAt?: string,
  ) {
    const payload = await getTestPayload()
    const doc = await payload.create({
      collection: 'alerts',
      data: {
        user: owner.id,
        watchArea,
        declaration,
        changeType,
        readAt,
        snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 1, distanceM: 0, receivedAt: null },
      },
      overrideAccess: true,
    })
    return doc.id
  }

  async function pipelineRun(status: 'succeeded' | 'partial' | 'failed', finishedAt: Date) {
    const payload = await getTestPayload()
    await payload.create({
      collection: 'job-runs',
      data: {
        task: 'pipeline',
        status,
        startedAt: new Date(finishedAt.getTime() - 60_000).toISOString(),
        finishedAt: finishedAt.toISOString(),
      },
      overrideAccess: true,
    })
  }

  const newCounts = async (user: User) =>
    Object.fromEntries(
      (await loadWatchAreaDashboard(await getTestPayload(), user)).areas.map((a) => [
        a.id,
        a.newCount,
      ]),
    )

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await createTestUser(payload, { role: 'admin' })
    anna = await createTestUser(payload)
    ben = await createTestUser(payload)
    carl = await createTestUser(payload)
    annasArea = await area(anna, 'Mökki')
    annasOtherArea = await area(anna, 'Kotitalo')
    bensArea = await area(ben, 'Bennin metsä')
    carlsArea = await area(carl, 'Carlin metsä')
    declaration = await insertDeclarationRaw(payload, { sourceId: 'mv083' })
  })

  beforeEach(() => {
    vi.mocked(revalidateTag).mockReset()
    vi.mocked(unstable_cache).mockClear()
  })
  // The mocks outlive this file (`isolate: false`): leave `revalidateTag` a no-op.
  afterEach(() => {
    vi.mocked(revalidateTag).mockReset()
  })

  describe('counts', () => {
    beforeAll(async () => {
      await alert(anna, annasArea, 'new')
      await alert(anna, annasArea, 'geometry_changed')
      await alert(anna, annasArea, 'attributes_changed', '2026-10-24T08:00:00.000Z')
      // Hidden from the feed, so from the counts too.
      await alert(anna, annasArea, 'removed')
      await alert(anna, annasOtherArea, 'new')
      await alert(ben, bensArea, 'new')
    })

    it('counts the unread alerts the feed shows per area on /vahtialueet', async () => {
      expect(await newCounts(anna)).toEqual({ [annasArea]: 2, [annasOtherArea]: 1 })
      expect(await newCounts(ben)).toEqual({ [bensArea]: 1 })
      expect(await newCounts(carl)).toEqual({ [carlsArea]: 0 })
    })

    it('gives the nav badge the sum of the area counts, cached under alerts:<userId>', async () => {
      const payload = await getTestPayload()
      expect(await cachedUnreadAlertCount(payload, anna)).toBe(3)
      expect(await countUnreadAlerts(payload, anna)).toBe(3)
      expect(unstable_cache).toHaveBeenCalledWith(
        expect.any(Function),
        ['unread-alerts', `${anna.id}`],
        {
          tags: [`alerts:${anna.id}`],
          revalidate: BADGE_CACHE_SECONDS,
        },
      )
      expect(await cachedUnreadAlertCount(payload, ben)).toBe(1)
      expect(unstable_cache).toHaveBeenLastCalledWith(
        expect.any(Function),
        ['unread-alerts', `${ben.id}`],
        { tags: [`alerts:${ben.id}`], revalidate: BADGE_CACHE_SECONDS },
      )
    })
  })

  describe('status strip', () => {
    const now = new Date('2026-10-25T12:00:00.000Z')

    it('reads "not fetched yet" and no warning before the first succeeded run', async () => {
      await pipelineRun('failed', new Date(now.getTime() - 2 * HOUR_MS))
      const dashboard = await loadWatchAreaDashboard(await getTestPayload(), anna, now)
      expect(dashboard).toMatchObject({ dataUpdatedAt: null, dataStale: false })
    })

    it('dates the strip from the last succeeded pipeline run and warns once it is stale', async () => {
      const payload = await getTestPayload()
      const succeeded = new Date(now.getTime() - 13 * HOUR_MS)
      await pipelineRun('succeeded', succeeded)
      // A later partial or failed run does not count as an update.
      await pipelineRun('partial', new Date(now.getTime() - HOUR_MS))

      expect(await loadWatchAreaDashboard(payload, anna, now)).toMatchObject({
        dataUpdatedAt: succeeded.toISOString(),
        dataStale: false,
      })
      // 14 h after it finished one run has been missed.
      expect(
        await loadWatchAreaDashboard(
          payload,
          anna,
          new Date(succeeded.getTime() + 14 * HOUR_MS + 1),
        ),
      ).toMatchObject({ dataUpdatedAt: succeeded.toISOString(), dataStale: true })
    })
  })

  describe('badge revalidation', () => {
    function steps(match: () => Promise<void>): PipelineSteps {
      return {
        fetch: async () => fetched,
        match: async () => {
          await match()
          return matched
        },
        notify: async () => sent,
      }
    }

    it('expires the badge of every account the pipeline run alerted, and only theirs', async () => {
      const payload = await getTestPayload()
      // Carl's alert predates the run.
      await alert(carl, carlsArea)
      await runPipeline(
        createJobContext(payload, 'mv083-run'),
        steps(async () => {
          await alert(anna, annasArea)
          await alert(anna, annasOtherArea)
          await alert(ben, bensArea)
        }),
      )

      expect(revalidateTag).toHaveBeenCalledTimes(2)
      expect(revalidateTag).toHaveBeenCalledWith(`alerts:${anna.id}`, { expire: 0 })
      expect(revalidateTag).toHaveBeenCalledWith(`alerts:${ben.id}`, { expire: 0 })
    })

    it('revalidates nothing after a run without new alerts', async () => {
      const payload = await getTestPayload()
      await runPipeline(
        createJobContext(payload, 'mv083-quiet'),
        steps(async () => {}),
      )
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('still revalidates after a failed step, before the run fails', async () => {
      const payload = await getTestPayload()
      const run = runPipeline(createJobContext(payload, 'mv083-failed-notify'), {
        ...steps(async () => {
          await alert(ben, bensArea)
        }),
        notify: async () => {
          throw new Error('SMTP down')
        },
      })
      await expect(run).rejects.toThrow('SMTP down')
      expect(revalidateTag).toHaveBeenCalledWith(`alerts:${ben.id}`, { expire: 0 })
    })

    it('does not fail the run outside a Next.js request (pnpm jobs:run)', async () => {
      const payload = await getTestPayload()
      vi.mocked(revalidateTag).mockImplementation(() => {
        throw new Error('Invariant: static generation store missing in revalidateTag alerts:1')
      })
      const since = new Date()
      await alert(carl, carlsArea)
      expect(await revalidateAlertBadges(payload, since)).toEqual([])

      await expect(
        runPipeline(
          createJobContext(payload, 'mv083-cli'),
          steps(async () => {
            await alert(carl, carlsArea)
          }),
        ),
      ).resolves.toMatchObject({ match: 'succeeded', notify: 'succeeded' })
    })
  })
})
