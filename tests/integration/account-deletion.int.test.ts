import type { CollectionSlug, Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as deleteRoute } from '@/app/api/account/delete/route'
import { ACCOUNT_DELETED_SUBJECT } from '@/emails/AccountDeleted'
import { accountDeletionLimiter, requestAccountDeletion } from '@/lib/account/account-deletion'
import { requestDataExport } from '@/lib/account/data-export'
import { recordSessionSeen } from '@/lib/account/sessions'
import { loginUser } from '@/lib/auth/login'
import { readSessionToken } from '@/lib/auth/session'
import { createJobContext } from '@/lib/jobs/context'
import { hashEmail, runAccountDeletion } from '@/lib/jobs/delete-account'
import type { User } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

type TestUser = User & { password: string }

/** Every (collection, field) whose field is a relationship to `users`, from the live config. */
function userReferences(payload: Payload): { collection: CollectionSlug; field: string }[] {
  const references: { collection: CollectionSlug; field: string }[] = []
  for (const collection of payload.config.collections) {
    for (const field of collection.flattenedFields) {
      if (field.type === 'relationship' && field.relationTo === 'users') {
        references.push({ collection: collection.slug as CollectionSlug, field: field.name })
      }
    }
  }
  return references
}

/** How many rows of each referencing collection still point at `userId` (only non-zero ones). */
async function rowsFor(payload: Payload, userId: number): Promise<Record<string, number>> {
  const left: Record<string, number> = {}
  for (const { collection, field } of userReferences(payload)) {
    const { totalDocs } = await payload.count({
      collection,
      where: { [field]: { equals: userId } },
      overrideAccess: true,
    })
    if (totalDocs > 0) left[`${collection}.${field}`] = totalDocs
  }
  return left
}

/**
 * MV-094 against a real Payload, Postgres and Mailpit: the password re-check, the stamp that
 * ends every session and blocks logins, then the `delete-account` job: `AccountDeleted` first,
 * then no row left for the user in any collection except the anonymised consent events, and
 * the other account untouched.
 */
describe('account deletion (MV-094)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)
  let payload: Payload
  let declarationId: number

  /** An account with something in every collection that refers to users. */
  async function seedAccount(name: string): Promise<{ user: TestUser; sid: string }> {
    const user = await createTestUser(payload, { name })
    const area = await payload.create({
      collection: 'watch-areas',
      data: { name: `${name} metsä`, center: [25.68, 62.24], radiusM: 500, owner: user.id },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'watch-area-declarations',
      data: {
        watchArea: area.id,
        declaration: declarationId,
        firstMatchedAt: '2026-10-01T06:00:00.000Z',
        lastMatchedAt: '2026-10-01T06:00:00.000Z',
        lastSeenGeomHash: 'geom-mv094',
        lastSeenAttrHash: 'attr-mv094',
        distanceM: 0,
      },
      overrideAccess: true,
    })
    const alert = await payload.create({
      collection: 'alerts',
      data: {
        user: user.id,
        watchArea: area.id,
        declaration: declarationId,
        changeType: 'new',
        snapshot: { cuttingTypeLabel: 'Avohakkuu', areaHa: 1, distanceM: 0, receivedAt: null },
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'notification-log',
      data: {
        type: 'alert_immediate',
        user: user.id,
        recipient: user.email,
        alerts: [alert.id],
        provider: 'smtp',
        status: 'sent',
        sentAt: '2026-10-01T06:05:00.000Z',
      },
      overrideAccess: true,
    })
    // A send logged by address only (no user), as the auth flows can write it.
    await payload.create({
      collection: 'notification-log',
      data: { type: 'password_reset', recipient: user.email, provider: 'smtp', status: 'sent' },
      overrideAccess: true,
    })
    for (const kind of ['terms', 'privacy', 'marketing'] as const) {
      await payload.create({
        collection: 'consent-events',
        data: { user: user.id, kind, version: '2026-09', granted: kind !== 'marketing' },
        overrideAccess: true,
      })
    }
    const { jobId } = await requestDataExport(payload, user)
    await payload.jobs.runByID({ id: jobId })

    const login = await loginUser(payload, {
      email: user.email,
      password: user.password,
      remember: false,
    })
    if (login.status !== 'ok') throw new Error(`login failed: ${login.status}`)
    const sid = readSessionToken(login.token, payload.secret)!.sid!
    await recordSessionSeen(payload, { user: login.user, sid, userAgent: 'Vitest' })
    return { user, sid }
  }

  async function goodbyeEmails(address: string) {
    return (await mailpit.listMessages()).filter(
      (m) => m.To[0]?.Address === address && m.Subject === ACCOUNT_DELETED_SUBJECT,
    )
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    await createTestUser(payload, { role: 'admin' })
    declarationId = await insertDeclarationRaw(payload, { sourceId: 'mv094-1' })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await accountDeletionLimiter.reset()
  })

  it('finds a reference to users in every collection the job must empty', () => {
    const collections = new Set(userReferences(payload).map((r) => r.collection))
    for (const slug of [
      'watch-areas',
      'alerts',
      'notification-log',
      'consent-events',
      'data-export-requests',
      'exports',
      'user-sessions',
    ]) {
      expect(collections).toContain(slug)
    }
  })

  it('deletes everything of the account, keeps anonymised consent events and blocks the login', async () => {
    const { user } = await seedAccount('Liisa')
    const other = await seedAccount('Pekka')
    const before = await rowsFor(payload, user.id)
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(7)
    const othersBefore = await rowsFor(payload, other.user.id)

    // Wrong password: nothing happens.
    await expect(
      requestAccountDeletion(payload, user, { password: 'väärä-salasana' }),
    ).resolves.toEqual({ status: 'rejected', fieldErrors: { password: 'Salasana on väärin.' } })
    const readUser = (id: number) =>
      payload.findByID({ collection: 'users', id, depth: 0, showHiddenFields: true })
    const untouched = await readUser(user.id)
    expect(untouched.deletedAt ?? null).toBeNull()
    expect(untouched.sessions).toHaveLength(1)

    // Right password: stamped, every session ended, the job queued; a login is refused now.
    const outcome = await requestAccountDeletion(payload, user, { password: user.password })
    expect(outcome.status).toBe('queued')
    const stamped = await readUser(user.id)
    expect(stamped.deletedAt).toBeTruthy()
    expect(stamped.sessions ?? []).toHaveLength(0)
    await expect(
      loginUser(payload, { email: user.email, password: user.password, remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
    // The refused login leaves no session behind (Payload rolls its session write back).
    expect((await readUser(user.id)).sessions ?? []).toHaveLength(0)

    if (outcome.status !== 'queued') throw new Error('not queued')
    await payload.jobs.runByID({ id: outcome.jobId })

    // The user row and every row pointing at it are gone.
    expect(
      await payload.findByID({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
        disableErrors: true,
      }),
    ).toBeNull()
    expect(await rowsFor(payload, user.id)).toEqual({})
    const { totalDocs: byAddress } = await payload.count({
      collection: 'notification-log',
      where: { recipient: { equals: user.email } },
      overrideAccess: true,
    })
    expect(byAddress).toBe(0)
    await expect(
      loginUser(payload, { email: user.email, password: user.password, remember: false }),
    ).resolves.toEqual({ status: 'invalid' })

    // The consent events stay, without the user and with the address hash only.
    const { docs: consents } = await payload.find({
      collection: 'consent-events',
      where: { emailHash: { equals: hashEmail(user.email) } },
      depth: 0,
      overrideAccess: true,
    })
    expect(consents.map((c) => c.kind).sort()).toEqual(['marketing', 'privacy', 'terms'])
    for (const consent of consents) expect(consent.user ?? null).toBeNull()

    // The goodbye email went out, with the attribution, and is logged without user or address.
    await vi.waitFor(async () => expect(await goodbyeEmails(user.email)).toHaveLength(1), {
      timeout: 10_000,
      interval: 200,
    })
    const message = await mailpit.getMessage((await goodbyeEmails(user.email))[0]!.ID)
    expect(message.HTML).toContain('Tili, 1 vahtialue, ilmoitushistoria')
    expect(message.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
    const { docs: log } = await payload.find({
      collection: 'notification-log',
      where: { type: { equals: 'account_deleted' }, jobRunId: { equals: outcome.jobId } },
      depth: 0,
      overrideAccess: true,
    })
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ status: 'sent' })
    expect(log[0]!.user ?? null).toBeNull()
    expect(log[0]!.recipient ?? null).toBeNull()

    // The run is recorded with its counters.
    const { docs: runs } = await payload.find({
      collection: 'job-runs',
      where: { task: { equals: 'delete-account' }, runId: { equals: outcome.jobId } },
      overrideAccess: true,
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ status: 'succeeded' })
    expect(runs[0]!.stats).toMatchObject({
      emailsSent: 1,
      alerts: 1,
      watchAreaDeclarations: 1,
      watchAreas: 1,
      // The alert email, the reset sent by address only, and the export's own `data_export`.
      notifications: 3,
      consentEvents: 3,
      dataExports: 1,
      sessions: 1,
      users: 1,
    })

    // The other account is untouched and can still log in.
    expect(await rowsFor(payload, other.user.id)).toEqual(othersBefore)
    await expect(
      loginUser(payload, {
        email: other.user.email,
        password: other.user.password,
        remember: false,
      }),
    ).resolves.toMatchObject({ status: 'ok' })
  })

  it('finishes an interrupted deletion on retry without a second email', async () => {
    const { user } = await seedAccount('Kalle')
    const outcome = await requestAccountDeletion(payload, user, { password: user.password })
    if (outcome.status !== 'queued') throw new Error('not queued')
    const ctx = createJobContext(payload, outcome.jobId)

    // The first attempt dies after the email, while deleting the watch areas.
    const deleteMany = payload.db.deleteMany.bind(payload.db)
    vi.spyOn(payload.db, 'deleteMany').mockImplementation(async (args) => {
      if (args.collection === 'watch-areas') throw new Error('database went away')
      return deleteMany(args)
    })
    await expect(runAccountDeletion(ctx, user.id)).rejects.toThrow('database went away')
    vi.restoreAllMocks()
    expect(
      await payload.count({ collection: 'users', where: { id: { equals: user.id } } }),
    ).toEqual({ totalDocs: 1 })

    const retry = await runAccountDeletion(ctx, user.id)
    expect(retry).toMatchObject({ emailsSent: 0, alerts: 0, watchAreas: 1, users: 1 })
    expect(await rowsFor(payload, user.id)).toEqual({})
    await vi.waitFor(async () => expect(await goodbyeEmails(user.email)).toHaveLength(1), {
      timeout: 10_000,
      interval: 200,
    })

    // Once the row is gone, another run is a no-op.
    await expect(runAccountDeletion(ctx, user.id)).resolves.toMatchObject({ users: 0 })
  })

  it('refuses to delete an account that did not ask, and sends nothing', async () => {
    const user = await createTestUser(payload)
    await expect(runAccountDeletion(createJobContext(payload, 'stray'), user.id)).rejects.toThrow(
      'has not asked for deletion',
    )
    expect(
      await payload.findByID({ collection: 'users', id: user.id, overrideAccess: true }),
    ).toMatchObject({ id: user.id })
    expect(await goodbyeEmails(user.email)).toHaveLength(0)
  })

  it('limits password attempts to five per 15 minutes', async () => {
    const user = await createTestUser(payload)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        requestAccountDeletion(payload, user, { password: 'väärä' }),
      ).resolves.toMatchObject({ status: 'rejected' })
    }
    await expect(
      requestAccountDeletion(payload, user, { password: user.password }),
    ).resolves.toMatchObject({ status: 'limited' })
    const stillThere = await payload.findByID({ collection: 'users', id: user.id, depth: 0 })
    expect(stillThere.deletedAt ?? null).toBeNull()
  })

  it('takes JSON only at POST /api/account/delete', async () => {
    const response = await deleteRoute(
      new Request('http://localhost/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'confirm=POISTA&password=x',
      }),
    )
    expect(response.status).toBe(415)
  })
})
