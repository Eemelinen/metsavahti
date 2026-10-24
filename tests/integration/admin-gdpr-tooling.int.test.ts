import type { Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as deleteRoute } from '@/app/api/admin/users/[id]/delete/route'
import { POST as exportRoute } from '@/app/api/admin/users/[id]/export/route'
import { ACCOUNT_DELETED_SUBJECT } from '@/emails/AccountDeleted'
import { EXPORT_READY_SUBJECT } from '@/emails/ExportReady'
import { adminGdprOverview } from '@/lib/account/admin-gdpr'
import { loginUser } from '@/lib/auth/login'
import { env } from '@/lib/env'
import type { User } from '@/payload-types'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

type TestUser = User & { password: string }
type Route = typeof exportRoute

/**
 * MV-098 against a real Payload, Postgres and Mailpit: the admin GDPR routes behind the user
 * detail view's buttons are admin-only (401 guest, 403 member, 403 cross-origin cookie), an
 * admin's export and deletion run the same jobs as the account's own, the export link goes
 * to the account, admin accounts cannot be deleted, and every action leaves an `admin-gdpr`
 * audit row in `job_runs` under the run id of its job. The panel's data: consent history
 * newest first, the export state without the account's download link.
 */
describe('admin GDPR tooling (MV-098)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)
  let payload: Payload
  let admin: TestUser
  let member: TestUser

  async function sessionHeaders(user: TestUser, origin = env.NEXT_PUBLIC_SERVER_URL) {
    const { token } = await payload.login({
      collection: 'users',
      data: { email: user.email, password: user.password },
    })
    return { cookie: `payload-token=${token}`, origin, 'content-type': 'application/json' }
  }

  async function call(route: Route, id: number | string, headers: Record<string, string> = {}) {
    const action = route === exportRoute ? 'export' : 'delete'
    return route(
      new Request(`http://localhost/api/admin/users/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: '{}',
      }),
      { params: Promise.resolve({ id: String(id) }) },
    )
  }

  async function auditRows(userId: number) {
    const { docs } = await payload.find({
      collection: 'job-runs',
      where: { task: { equals: 'admin-gdpr' } },
      sort: 'startedAt',
      limit: 100,
      overrideAccess: true,
    })
    return docs.filter((row) => (row.stats as { userId?: number } | null)?.userId === userId)
  }

  async function emailsTo(address: string, subject: string) {
    return (await mailpit.listMessages()).filter(
      (m) => m.To[0]?.Address === address && m.Subject === subject,
    )
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    admin = await createTestUser(payload, { role: 'admin' })
    member = await createTestUser(payload)
  })

  afterEach(() => vi.restoreAllMocks())

  describe('access', () => {
    it.each([
      ['export', exportRoute],
      ['delete', deleteRoute],
    ])(
      'answers 401 to a guest and 403 to a member at %s, and changes nothing',
      async (_, route) => {
        const target = await createTestUser(payload)
        expect((await call(route, target.id)).status).toBe(401)
        expect((await call(route, target.id, await sessionHeaders(member))).status).toBe(403)
        // A member cannot act on their own account through the admin route either.
        expect((await call(route, member.id, await sessionHeaders(member))).status).toBe(403)

        expect(await auditRows(target.id)).toEqual([])
        const { totalDocs } = await payload.count({
          collection: 'data-export-requests',
          where: { user: { equals: target.id } },
          overrideAccess: true,
        })
        expect(totalDocs).toBe(0)
        const stored = await payload.findByID({ collection: 'users', id: target.id, depth: 0 })
        expect(stored.deletedAt ?? null).toBeNull()
      },
    )

    it('ignores an admin session cookie sent from another origin', async () => {
      const target = await createTestUser(payload)
      const headers = await sessionHeaders(admin, 'https://evil.example')
      expect((await call(deleteRoute, target.id, headers)).status).toBe(401)
      expect(await auditRows(target.id)).toEqual([])
    })

    it('takes JSON only and answers 404 for an unknown or malformed id', async () => {
      const headers = await sessionHeaders(admin)
      const form = await exportRoute(
        new Request(`http://localhost/api/admin/users/${member.id}/export`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
          body: 'x=1',
        }),
        { params: Promise.resolve({ id: String(member.id) }) },
      )
      expect(form.status).toBe(415)
      expect((await call(exportRoute, 999_999, headers)).status).toBe(404)
      expect((await call(deleteRoute, 'abc', headers)).status).toBe(404)
    })
  })

  it("exports an account's data for an admin, emails the account and audits it", async () => {
    const target = await createTestUser(payload, { name: 'Tukipyyntö Tiina' })
    const res = await call(exportRoute, target.id, await sessionHeaders(admin))
    expect(res.status).toBe(202)
    const { data } = (await res.json()) as { data: { jobId: string; requestId: number } }

    // The same export as the account's own: ready, and the link went to the account.
    const request = await payload.findByID({
      collection: 'data-export-requests',
      id: data.requestId,
      depth: 0,
      overrideAccess: true,
    })
    expect(request).toMatchObject({ user: target.id, status: 'ready' })
    await vi.waitFor(
      async () => expect(await emailsTo(target.email, EXPORT_READY_SUBJECT)).toHaveLength(1),
      { timeout: 10_000, interval: 200 },
    )
    expect(await emailsTo(admin.email, EXPORT_READY_SUBJECT)).toHaveLength(0)

    // One audit row, tied to the export job's own row by the run id.
    const audit = await auditRows(target.id)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      status: 'succeeded',
      runId: data.jobId,
      stats: {
        action: 'export',
        userId: target.id,
        adminId: admin.id,
        jobId: data.jobId,
        requestId: data.requestId,
      },
    })
    expect(audit[0]!.finishedAt).toBeTruthy()
    const { docs: runs } = await payload.find({
      collection: 'job-runs',
      where: { runId: { equals: data.jobId } },
      overrideAccess: true,
    })
    expect(runs.map((r) => r.task).sort()).toEqual(['admin-gdpr', 'export'])

    // The one-per-day limit applies to admins as well; a refused request is not audited.
    const again = await call(exportRoute, target.id, await sessionHeaders(admin))
    expect(again.status).toBe(429)
    expect(await auditRows(target.id)).toHaveLength(1)

    // The panel shows the state, never the account's download link.
    const overview = await adminGdprOverview(payload, target.id)
    expect(overview.exportState).toMatchObject({ status: 'ready' })
    expect(overview.exportState).not.toHaveProperty('downloadUrl')
  })

  it('deletes an account for an admin without its password and audits it', async () => {
    const target = await createTestUser(payload, { name: 'Poistettava Paavo' })
    await payload.create({
      collection: 'watch-areas',
      data: { name: 'Paavon metsä', center: [25.68, 62.24], radiusM: 500, owner: target.id },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'consent-events',
      data: { user: target.id, kind: 'terms', version: '2026-09', granted: true },
      overrideAccess: true,
    })

    const res = await call(deleteRoute, target.id, await sessionHeaders(admin))
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { jobId: string } }

    expect(
      await payload.findByID({
        collection: 'users',
        id: target.id,
        overrideAccess: true,
        disableErrors: true,
      }),
    ).toBeNull()
    const { totalDocs: areas } = await payload.count({
      collection: 'watch-areas',
      where: { owner: { equals: target.id } },
      overrideAccess: true,
    })
    expect(areas).toBe(0)
    await expect(
      loginUser(payload, { email: target.email, password: target.password, remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
    await vi.waitFor(
      async () => expect(await emailsTo(target.email, ACCOUNT_DELETED_SUBJECT)).toHaveLength(1),
      { timeout: 10_000, interval: 200 },
    )

    // The audit row outlives the account and names ids only.
    const audit = await auditRows(target.id)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      runId: data.jobId,
      stats: { action: 'delete-account', userId: target.id, adminId: admin.id },
    })
    expect(JSON.stringify(audit[0]!.stats)).not.toContain(target.email)
    const { docs: runs } = await payload.find({
      collection: 'job-runs',
      where: { runId: { equals: data.jobId } },
      overrideAccess: true,
    })
    expect(runs.map((r) => [r.task, r.status]).sort()).toEqual([
      ['admin-gdpr', 'succeeded'],
      ['delete-account', 'succeeded'],
    ])
  })

  it('refuses to delete an admin account, the acting admin included', async () => {
    // Only the first account is created as admin; promote another one by update.
    const otherAdmin = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: otherAdmin.id,
      data: { role: 'admin' },
      overrideAccess: true,
    })
    const headers = await sessionHeaders(admin)
    for (const id of [otherAdmin.id, admin.id]) {
      const res = await call(deleteRoute, id, headers)
      expect(res.status).toBe(403)
      const body = (await res.json()) as { error: { message: string } }
      expect(body.error.message).toContain('Ylläpitäjän tiliä ei voi poistaa')
      const stored = await payload.findByID({ collection: 'users', id, depth: 0 })
      expect(stored.deletedAt ?? null).toBeNull()
      expect(await auditRows(id)).toEqual([])
    }
  })

  it('refuses an export for an account that is being deleted', async () => {
    const target = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: target.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    const res = await call(exportRoute, target.id, await sessionHeaders(admin))
    expect(res.status).toBe(403)
    expect(await auditRows(target.id)).toEqual([])
  })

  it("lists the account's consent history newest first", async () => {
    const target = await createTestUser(payload)
    const other = await createTestUser(payload)
    for (const [kind, granted] of [
      ['terms', true],
      ['privacy', true],
      ['marketing', false],
    ] as const) {
      await payload.create({
        collection: 'consent-events',
        data: { user: target.id, kind, version: '2026-09', granted },
        overrideAccess: true,
      })
      // Distinct `createdAt` milliseconds, so the order is the creation order.
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    await payload.create({
      collection: 'consent-events',
      data: { user: other.id, kind: 'cookies', version: '2026-09', granted: true },
      overrideAccess: true,
    })

    const { consents, exportState } = await adminGdprOverview(payload, target.id)
    expect(consents.map((c) => [c.kind, c.granted])).toEqual([
      ['marketing', false],
      ['privacy', true],
      ['terms', true],
    ])
    expect(exportState).toMatchObject({ status: 'none', nextAllowedAt: null })
  })

  it('puts the GDPR panel on the user detail view only', () => {
    const field = payload.collections.users.config.fields.find(
      (f) => 'name' in f && f.name === 'gdpr',
    )
    expect(field).toMatchObject({
      type: 'ui',
      admin: {
        components: { Field: '/components/admin/user-gdpr-panel#UserGdprPanel' },
        disableListColumn: true,
      },
    })
  })
})
