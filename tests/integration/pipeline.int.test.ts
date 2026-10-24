import { HttpResponse, http } from 'msw'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { env } from '@/lib/env'
import { toWgs84 } from '@/lib/geo/crs'
import type { DeclarationFeatureCollection } from '@/lib/wfs/schemas'
import type { JobRun } from '@/payload-types'
import { createMailpitClient } from '../helpers/mailpit'
import { server } from '../helpers/msw'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'
import {
  fixtureBbox,
  loadWfsFixture,
  requestBbox,
  wfsResponseForBbox,
} from '../helpers/wfs-fixture'

const WFS_URL = 'http://wfs.test/rajapinnat/v1/ows/'
const HOUR_MS = 60 * 60 * 1000
const CAPABILITIES = '<?xml version="1.0"?><wfs:WFS_Capabilities version="2.0.0"/>'

type RunResponse = { ok: boolean; runId: string; status: string; error?: string }
type HealthResponse = {
  ok: boolean
  db: string
  lastPipelineRun: Pick<JobRun, 'runId' | 'status' | 'startedAt' | 'finishedAt' | 'stats'> | null
  stale: boolean
  wfsReachable?: boolean
}

/**
 * MV-075 (absorbed MV-078): `sync-declarations` end to end through `POST /api/jobs/run`
 * (fixture WFS → declarations → alerts → email in Mailpit), the advisory lock against a
 * second trigger during a run, and `/api/health`'s last run, `stale` and `?deep=1`.
 */
describe('pipeline orchestration and health (MV-075)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)
  let payload: Payload
  let fixture: DeclarationFeatureCollection
  let ownerEmail: string
  /** While set, `GetFeature` answers only once it resolves: holds a run inside its fetch. */
  let featureGate: Promise<void> | null = null
  let capabilitiesStatus = 200

  async function trigger() {
    const { POST } = await import('@/app/api/jobs/run/route')
    return POST(
      new Request('http://localhost/api/jobs/run', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }),
    )
  }

  async function health(query = ''): Promise<HealthResponse> {
    const { GET } = await import('@/app/api/health/route')
    const res = await GET(new Request(`http://localhost/api/health${query}`))
    expect(res.status).toBe(200)
    return (await res.json()) as HealthResponse
  }

  async function runRows(runId: string) {
    const { docs } = await payload.find({
      collection: 'job-runs',
      where: { runId: { equals: runId } },
      sort: 'id',
      overrideAccess: true,
    })
    return docs
  }

  const alertEmails = async () =>
    (await mailpit.listMessages()).filter((m) => m.Subject.startsWith('Metsävahti:'))

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' }) // Mailpit + Postgres go over real sockets
    server.use(
      http.get(WFS_URL, async ({ request }) => {
        const params = new URL(request.url).searchParams
        if (params.get('request') === 'GetCapabilities') {
          return new HttpResponse(capabilitiesStatus === 200 ? CAPABILITIES : 'unavailable', {
            status: capabilitiesStatus,
            headers: { 'content-type': 'application/xml' },
          })
        }
        if (featureGate) await featureGate
        return HttpResponse.json(wfsResponseForBbox(fixture, requestBbox(params)))
      }),
    )
    fixture = loadWfsFixture()
    payload = await getTestPayload()
    await resetDatabase(payload)

    const owner = await createTestUser(payload, { name: 'Owner' })
    ownerEmail = owner.email
    const [minE, minN, maxE, maxN] = fixtureBbox(fixture)
    await payload.create({
      collection: 'watch-areas',
      data: {
        name: 'Mökki',
        center: toWgs84([(minE + maxE) / 2, (minN + maxN) / 2]),
        radiusM: 800,
        owner: owner.id,
      },
      overrideAccess: true,
    })
    // Creating the user sent a verification email; only alert emails matter below.
    await mailpit.deleteAll()
  })
  afterAll(() => server.close())

  it('health before the first run: no last run, stale, no WFS check', async () => {
    const body = await health()
    expect(body).toMatchObject({ ok: true, db: 'up', lastPipelineRun: null, stale: true })
    expect(body).not.toHaveProperty('wfsReachable')
  })

  let firstRunId: string

  it('first run: area + fake WFS → one alert email and a succeeded summary row', async () => {
    const res = await trigger()
    expect(res.status).toBe(200)
    const body = (await res.json()) as RunResponse
    expect(body).toMatchObject({ ok: true, status: 'success' })
    firstRunId = body.runId

    await mailpit.waitForMessages(1)
    const messages = await alertEmails()
    expect(messages).toHaveLength(1)
    expect(messages[0]!.To[0]!.Address).toBe(ownerEmail)

    const rows = await runRows(firstRunId)
    expect(rows.map((r) => r.task)).toEqual([
      'pipeline',
      'fetch-declarations',
      'match-watch-areas',
      'send-alerts',
    ])
    expect(rows.every((r) => r.status === 'succeeded')).toBe(true)
    expect(rows[0]!.stats).toEqual({
      fetch: 'succeeded',
      match: 'succeeded',
      notify: 'succeeded',
      requests: 1,
      features: fixture.features.length,
      inserted: fixture.features.length,
      updated: 0,
      removed: 0,
      failedBboxes: 0,
      alertsCreated: fixture.features.length,
      emailsSent: 1,
      emailsFailed: 0,
    })
    // The summary spans the steps.
    expect(rows[0]!.startedAt <= rows[1]!.startedAt).toBe(true)
    expect(rows[0]!.finishedAt! >= rows[3]!.finishedAt!).toBe(true)
  })

  it('second run with the same data: no new alerts, no new email', async () => {
    const body = (await (await trigger()).json()) as RunResponse
    expect(body.ok).toBe(true)

    expect(await alertEmails()).toHaveLength(1)
    const [summary] = await runRows(body.runId)
    expect(summary).toMatchObject({
      task: 'pipeline',
      status: 'succeeded',
      stats: { inserted: 0, alertsCreated: 0, emailsSent: 0 },
    })
  })

  it('a trigger during a run answers 409 and queues nothing; the run finishes', async () => {
    let open: () => void = () => {}
    featureGate = new Promise((resolve) => (open = resolve))
    try {
      const running = trigger()
      // The first run holds the lock once its fetch step has started.
      await vi.waitFor(
        async () => {
          const { totalDocs } = await payload.count({
            collection: 'job-runs',
            where: { task: { equals: 'fetch-declarations' }, status: { equals: 'running' } },
            overrideAccess: true,
          })
          expect(totalDocs).toBe(1)
        },
        { timeout: 10_000, interval: 50 },
      )
      const jobsBefore = (await payload.count({ collection: 'payload-jobs', overrideAccess: true }))
        .totalDocs

      const second = await trigger()
      expect(second.status).toBe(409)
      expect(await second.json()).toEqual({ ok: false, error: 'already_running' })
      expect(
        (await payload.count({ collection: 'payload-jobs', overrideAccess: true })).totalDocs,
      ).toBe(jobsBefore)

      open()
      const first = await running
      expect(first.status).toBe(200)
      expect(((await first.json()) as RunResponse).ok).toBe(true)
    } finally {
      open()
      featureGate = null
    }

    // The lock is released with the run: the next trigger runs.
    expect((await trigger()).status).toBe(200)
    expect(await alertEmails()).toHaveLength(1)
  })

  it('health reports the last run and turns stale after 14 h', async () => {
    const [latest] = (
      await payload.find({
        collection: 'job-runs',
        where: { task: { equals: 'pipeline' } },
        sort: '-startedAt',
        limit: 1,
        overrideAccess: true,
      })
    ).docs
    expect(latest!.runId).not.toBe(firstRunId)

    const body = await health()
    expect(body.stale).toBe(false)
    expect(body.lastPipelineRun).toEqual({
      runId: latest!.runId,
      status: 'succeeded',
      startedAt: latest!.startedAt,
      finishedAt: latest!.finishedAt,
      stats: latest!.stats,
    })

    const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR_MS).toISOString()
    // The earlier runs move further back, so `latest` stays the newest row.
    await payload.update({
      collection: 'job-runs',
      where: { task: { equals: 'pipeline' }, id: { not_equals: latest!.id } },
      data: { startedAt: hoursAgo(20), finishedAt: hoursAgo(20) },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'job-runs',
      id: latest!.id,
      data: { startedAt: hoursAgo(13.5), finishedAt: hoursAgo(13) },
      overrideAccess: true,
    })
    const recent = await health()
    expect(recent.stale).toBe(false)
    expect(recent.lastPipelineRun?.runId).toBe(latest!.runId)

    await payload.update({
      collection: 'job-runs',
      id: latest!.id,
      data: { startedAt: hoursAgo(15), finishedAt: hoursAgo(14.5) },
      overrideAccess: true,
    })
    const stale = await health()
    expect(stale.stale).toBe(true)
    expect(stale.lastPipelineRun?.runId).toBe(latest!.runId)
  })

  it('?deep=1 asks the WFS for its capabilities', async () => {
    capabilitiesStatus = 200
    expect((await health('?deep=1')).wfsReachable).toBe(true)

    capabilitiesStatus = 503
    try {
      const body = await health('?deep=1')
      expect(body).toMatchObject({ ok: true, db: 'up', wfsReachable: false })
    } finally {
      capabilitiesStatus = 200
    }
  })
})
