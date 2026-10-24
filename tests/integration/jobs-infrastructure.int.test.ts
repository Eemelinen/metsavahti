import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { HttpResponse, http } from 'msw'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { env } from '@/lib/env'
import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { server } from '../helpers/msw'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'
import { loadWfsFixture, wfsResponseForBbox } from '../helpers/wfs-fixture'

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()

type RunResponse = {
  ok: boolean
  runId: string
  job: string
  status: string
  remainingJobs: number
}

/**
 * MV-070 (absorbed MV-076): `POST /api/jobs/run` (cron secret or admin session), the
 * `job_runs` rows every task writes through `withJobRun()`, and the weekly `cleanup` task
 * applying the rules of `config/retention.ts`.
 */
describe('jobs infrastructure (MV-070)', () => {
  let payload: Payload
  let admin: User & { password: string }
  let member: User & { password: string }

  const drizzle = () => (payload.db as unknown as PostgresAdapter).drizzle

  async function post(query = '', headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/jobs/run/route')
    return POST(new Request(`http://localhost/api/jobs/run${query}`, { method: 'POST', headers }))
  }

  const cron = { authorization: `Bearer ${env.CRON_SECRET}` }

  async function sessionCookie(user: User & { password: string }) {
    const { token } = await payload.login({
      collection: 'users',
      data: { email: user.email, password: user.password },
    })
    // A browser's same-origin `fetch` POST sends Origin; Payload checks it against `csrf`.
    return { cookie: `payload-token=${token}`, origin: env.NEXT_PUBLIC_SERVER_URL }
  }

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' })
    server.use(
      http.get('http://wfs.test/rajapinnat/v1/ows/', () =>
        HttpResponse.json(wfsResponseForBbox(loadWfsFixture(), null)),
      ),
    )
    payload = await getTestPayload()
    await resetDatabase(payload)
    admin = await createTestUser(payload, { role: 'admin' })
    member = await createTestUser(payload, { role: 'user' })
  })
  afterAll(() => server.close())

  describe('POST /api/jobs/run', () => {
    it('answers 401 without the cron secret or a session', async () => {
      expect((await post()).status).toBe(401)
      expect((await post('', { authorization: 'Bearer wrong' })).status).toBe(401)
      expect((await post('?task=cleanup')).status).toBe(401)
    })

    it('answers 403 to a signed-in user who is not an admin', async () => {
      const res = await post('', await sessionCookie(member))
      expect(res.status).toBe(403)
    })

    it('ignores an admin session cookie sent from another origin', async () => {
      const headers = { ...(await sessionCookie(admin)), origin: 'https://evil.example' }
      expect((await post('', headers)).status).toBe(401)
    })

    it('rejects an unknown task', async () => {
      const res = await post('?task=drop-everything', cron)
      expect(res.status).toBe(400)
    })

    it('runs the sync workflow and records one job_runs row per step under its runId', async () => {
      await payload.create({
        collection: 'watch-areas',
        data: { name: 'Koti', center: [25.75, 62.24], radiusM: 800, owner: member.id },
        overrideAccess: true,
      })

      const res = await post('', cron)
      expect(res.status).toBe(200)
      const body = (await res.json()) as RunResponse
      expect(body).toMatchObject({ ok: true, job: 'sync-declarations', remainingJobs: 0 })
      expect(body.runId).toMatch(/^\d+$/)

      const { docs } = await payload.find({
        collection: 'job-runs',
        where: { runId: { equals: body.runId } },
        sort: 'startedAt',
        overrideAccess: true,
      })
      expect(docs.map((r) => r.task)).toEqual([
        'fetch-declarations',
        'match-watch-areas',
        'send-alerts',
      ])
      for (const run of docs) {
        expect(run.status).toBe('succeeded')
        expect(run.finishedAt).toBeTruthy()
        expect(run.error ?? null).toBeNull()
      }
      expect(docs[0]!.stats).toMatchObject({ watchAreas: 1 })
    })

    it('lets an admin run it with a session cookie (the admin button)', async () => {
      const res = await post('', await sessionCookie(admin))
      expect(res.status).toBe(200)
      expect(((await res.json()) as RunResponse).ok).toBe(true)
    })
  })

  describe('cleanup task', () => {
    let expiredUnreferenced: number
    let expiredRecentAlert: number
    let expiredOldAlert: number
    let expiringSoon: number
    let current: number

    async function alertOn(declarationId: number, createdAt: string) {
      const area = await payload.find({ collection: 'watch-areas', limit: 1, overrideAccess: true })
      const alert = await payload.create({
        collection: 'alerts',
        data: {
          user: member.id,
          watchArea: area.docs[0]!.id,
          declaration: declarationId,
          changeType: 'new',
          snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 1, distanceM: 100, receivedAt: null },
        },
        overrideAccess: true,
      })
      await drizzle().execute(
        sql`UPDATE alerts SET created_at = ${createdAt}::timestamptz WHERE id = ${alert.id}`,
      )
      return alert.id
    }

    async function revisionOn(declarationId: number, changedAt: string) {
      const revision = await payload.create({
        collection: 'declaration-revisions',
        data: { declaration: declarationId, prevGeomHash: 'g', prevAttrHash: 'a', changedAt },
        overrideAccess: true,
      })
      return revision.id
    }

    const exists = async (
      collection: 'declarations' | 'alerts' | 'declaration-revisions',
      id: number,
    ) =>
      (await payload.find({ collection, where: { id: { equals: id } }, overrideAccess: true }))
        .totalDocs === 1

    // valid_until = received_at + 3 years (`insertDeclarationRaw`, `01 §3.3`)
    const receivedForValidUntil = (daysAgoValid: number) => {
      const d = new Date(Date.now() - daysAgoValid * DAY_MS)
      d.setUTCFullYear(d.getUTCFullYear() - 3)
      return d.toISOString()
    }

    let oldAlert: number
    let recentAlert: number
    let oldRevisionOfCurrent: number
    let recentRevisionOfCurrent: number
    let revisionOfExpired: number
    let oldJobRun: number
    let recentJobRun: number
    let staleExport: number
    let liveExport: number

    beforeAll(async () => {
      const declaration = (sourceId: string, validUntilDaysAgo: number) =>
        insertDeclarationRaw(payload, {
          sourceId,
          receivedAt: receivedForValidUntil(validUntilDaysAgo),
        })
      expiredUnreferenced = await declaration('cleanup.expired', 31)
      expiredRecentAlert = await declaration('cleanup.expired-recent-alert', 200)
      expiredOldAlert = await declaration('cleanup.expired-old-alert', 200)
      expiringSoon = await declaration('cleanup.expired-29-days', 29)
      current = await declaration('cleanup.current', -365)

      recentAlert = await alertOn(expiredRecentAlert, daysAgo(10))
      oldAlert = await alertOn(expiredOldAlert, daysAgo(120))
      revisionOfExpired = await revisionOn(expiredUnreferenced, daysAgo(40))
      oldRevisionOfCurrent = await revisionOn(current, daysAgo(400))
      recentRevisionOfCurrent = await revisionOn(current, daysAgo(300))

      const jobRun = async (startedAt: string) =>
        (
          await payload.create({
            collection: 'job-runs',
            data: { task: 'fetch-declarations', startedAt, status: 'succeeded' },
            overrideAccess: true,
          })
        ).id
      oldJobRun = await jobRun(daysAgo(91))
      recentJobRun = await jobRun(daysAgo(89))

      const exportRequest = async (expiresAt: string) =>
        (
          await payload.create({
            collection: 'data-export-requests',
            data: { user: member.id, status: 'ready', expiresAt },
            overrideAccess: true,
          })
        ).id
      staleExport = await exportRequest(daysAgo(1))
      liveExport = await exportRequest(new Date(Date.now() + DAY_MS).toISOString())

      await drizzle().execute(sql`
        INSERT INTO rate_limit_buckets (key, hits, expires_at) VALUES
          ('test:expired', '[]'::jsonb, ${daysAgo(1)}::timestamptz),
          ('test:live', '[]'::jsonb, ${new Date(Date.now() + DAY_MS).toISOString()}::timestamptz)
      `)
    })

    let body: RunResponse

    it('runs through POST /api/jobs/run?task=cleanup and records its job_runs row', async () => {
      const res = await post('?task=cleanup', cron)
      expect(res.status).toBe(200)
      body = (await res.json()) as RunResponse
      expect(body).toMatchObject({ ok: true, job: 'cleanup', remainingJobs: 0 })

      const { docs } = await payload.find({
        collection: 'job-runs',
        where: { runId: { equals: body.runId } },
        overrideAccess: true,
      })
      expect(docs).toHaveLength(1)
      expect(docs[0]).toMatchObject({
        task: 'cleanup',
        status: 'succeeded',
        stats: {
          declarations: 2,
          declarationRevisions: 1,
          dataExports: 1,
          jobRuns: 1,
          rateLimitBuckets: 1,
        },
      })
    })

    it('deletes declarations expired over 30 days ago unless an alert from the last 90 days refers to them', async () => {
      expect(await exists('declarations', expiredUnreferenced)).toBe(false)
      expect(await exists('declarations', expiredOldAlert)).toBe(false)
      expect(await exists('declarations', expiredRecentAlert)).toBe(true)
      expect(await exists('declarations', expiringSoon)).toBe(true)
      expect(await exists('declarations', current)).toBe(true)
    })

    it('takes the alerts and revisions of a deleted declaration with it', async () => {
      expect(await exists('alerts', oldAlert)).toBe(false)
      expect(await exists('alerts', recentAlert)).toBe(true)
      expect(await exists('declaration-revisions', revisionOfExpired)).toBe(false)
    })

    it('deletes revisions older than a year', async () => {
      expect(await exists('declaration-revisions', oldRevisionOfCurrent)).toBe(false)
      expect(await exists('declaration-revisions', recentRevisionOfCurrent)).toBe(true)
    })

    it('purges job_runs older than 90 days and expires stale export requests', async () => {
      const runs = await payload.find({
        collection: 'job-runs',
        where: { id: { in: [oldJobRun, recentJobRun] } },
        overrideAccess: true,
      })
      expect(runs.docs.map((r) => r.id)).toEqual([recentJobRun])

      const stale = await payload.findByID({
        collection: 'data-export-requests',
        id: staleExport,
        overrideAccess: true,
      })
      const live = await payload.findByID({
        collection: 'data-export-requests',
        id: liveExport,
        overrideAccess: true,
      })
      expect(stale.status).toBe('expired')
      expect(live.status).toBe('ready')
    })

    it('deletes rate-limit buckets whose window has ended', async () => {
      const { rows } = await drizzle().execute<{ key: string }>(
        sql`SELECT key FROM rate_limit_buckets WHERE starts_with(key, 'test:') ORDER BY key`,
      )
      expect(rows.map((r) => r.key)).toEqual(['test:live'])
    })

    it('is idempotent: a second run removes nothing more', async () => {
      const res = await post('?task=cleanup', cron)
      const second = (await res.json()) as RunResponse
      const { docs } = await payload.find({
        collection: 'job-runs',
        where: { runId: { equals: second.runId } },
        overrideAccess: true,
      })
      expect(docs[0]!.stats).toEqual({
        declarations: 0,
        declarationRevisions: 0,
        dataExports: 0,
        jobRuns: 0,
        rateLimitBuckets: 0,
      })
    })
  })
})
