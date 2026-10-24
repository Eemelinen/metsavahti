import { HttpResponse, http } from 'msw'
import type { Payload } from 'payload'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_ALERT_SEND_ATTEMPTS } from '@/config/notifications'
import { createJobContext } from '@/lib/jobs/context'
import { runJobNow } from '@/lib/jobs/run-now'
import { sendAlerts } from '@/lib/jobs/send-alerts'
import { scheduledDigestFor } from '@/lib/notifications/digest-schedule'
import type { Alert, User, WatchArea } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createMailpitClient } from '../helpers/mailpit'
import { server } from '../helpers/msw'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

/** Pipeline runs at 09:30 / 21:30 Finnish time (`01 §2`); 2026-10-24 is a Saturday (UTC+3). */
const SAT_EVENING = new Date('2026-10-24T18:30:00.000Z')
const SUN_MORNING = new Date('2026-10-25T07:30:00.000Z')
const MON_MORNING = new Date('2026-10-26T07:30:00.000Z')

const WFS_URL = 'http://wfs.test/rajapinnat/v1/ows/'

type Mode = 'immediate' | 'daily' | 'weekly'

/**
 * MV-074 (`01 §4.3`): `send-alerts` groups pending alerts per account, honours the account's
 * notification preferences, each area's switch and the run's digest schedule, logs every email
 * in `notification-log`, stamps `notifiedAt` and retries a failed alert at most five times.
 */
describe('send-notifications task (MV-074)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)
  let payload: Payload
  let declarationSeq = 0

  async function account(
    mode: Mode,
    prefs: { enabled?: boolean } = {},
  ): Promise<User & { password: string }> {
    const user = await createTestUser(payload, { name: `Tili ${mode}` })
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { notificationPrefs: { mode, enabled: prefs.enabled ?? true } },
      overrideAccess: true,
    })
    return user
  }

  async function area(owner: User, name: string, notificationsEnabled = true): Promise<WatchArea> {
    return payload.create({
      collection: 'watch-areas',
      data: {
        name,
        center: [25.745, 62.225],
        radiusM: 1000,
        owner: owner.id,
        notificationsEnabled,
      },
      overrideAccess: true,
    })
  }

  async function alert(owner: User, watchArea: WatchArea): Promise<Alert> {
    declarationSeq += 1
    const declaration = await insertDeclarationRaw(payload, {
      sourceId: `forestusedeclaration.74${declarationSeq}`,
      declarationNumber: `74-2026-${declarationSeq}`,
      cuttingTypeCode: 5,
    })
    return payload.create({
      collection: 'alerts',
      data: {
        user: owner.id,
        watchArea: watchArea.id,
        declaration,
        changeType: 'new',
        snapshot: {
          cuttingTypeLabel: 'Avohakkuu',
          areaHa: 2.5,
          distanceM: 352,
          receivedAt: '2026-10-20T06:00:00.000Z',
        },
      },
      overrideAccess: true,
    })
  }

  function runAt(now: Date) {
    const ctx = { ...createJobContext(payload, 'mv-074'), now: () => now }
    return sendAlerts(ctx, 'mv-074', { scheduledDigest: scheduledDigestFor(now) })
  }

  /** The alert emails (subject "Metsävahti: …") Mailpit holds for `user`; verification emails are left out. */
  async function messagesTo(user: User) {
    return (await mailpit.listMessages()).filter(
      (m) => m.To[0]?.Address === user.email && m.Subject.startsWith('Metsävahti:'),
    )
  }

  /** Wait until Mailpit holds `count` alert emails for `user`, then return them. */
  async function waitForAlertEmails(user: User, count: number) {
    let messages: Awaited<ReturnType<typeof messagesTo>> = []
    await vi.waitFor(
      async () => {
        messages = await messagesTo(user)
        expect(messages.length).toBeGreaterThanOrEqual(count)
      },
      { timeout: 10_000, interval: 200 },
    )
    return messages
  }

  async function reload(a: Alert): Promise<Alert> {
    return payload.findByID({ collection: 'alerts', id: a.id, overrideAccess: true })
  }

  async function logOf(user: User) {
    const { docs } = await payload.find({
      collection: 'notification-log',
      where: { user: { equals: user.id } },
      sort: 'id',
      depth: 0,
      overrideAccess: true,
    })
    return docs
  }

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  beforeEach(async () => {
    await resetDatabase(payload)
    await mailpit.deleteAll()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('immediate: one email per watch area on every run, then nothing until new alerts', async () => {
    const owner = await account('immediate')
    const mokki = await area(owner, 'Mökki')
    const pelto = await area(owner, 'Pelto')
    const mokkiAlerts = [await alert(owner, mokki), await alert(owner, mokki)]
    const peltoAlert = await alert(owner, pelto)

    // The 21:30 run is not a digest run; immediate emails go out on every run.
    const first = await runAt(SAT_EVENING)
    expect(first).toMatchObject({ emailsSent: 2, emailsFailed: 0, alertsHandled: 3 })

    const messages = await waitForAlertEmails(owner, 2)
    expect(messages).toHaveLength(2)
    expect(messages.map((m) => m.Subject).join(' ')).toContain('Mökki')
    expect(messages.map((m) => m.Subject).join(' ')).toContain('Pelto')

    for (const a of [...mokkiAlerts, peltoAlert]) {
      expect((await reload(a)).notifiedAt).toBe(SAT_EVENING.toISOString())
    }
    const log = await logOf(owner)
    expect(log.map((r) => [r.type, r.status, [...(r.alerts ?? [])].sort()])).toEqual([
      ['alert_immediate', 'sent', mokkiAlerts.map((a) => a.id).sort()],
      ['alert_immediate', 'sent', [peltoAlert.id]],
    ])

    expect(await runAt(SUN_MORNING)).toMatchObject({ emailsSent: 0, alertsHandled: 0 })
    expect(await messagesTo(owner)).toHaveLength(2)
  })

  it('daily: nothing on the 21:30 run, one digest of every area on the 09:30 run', async () => {
    const owner = await account('daily')
    const mokki = await area(owner, 'Mökki')
    const pelto = await area(owner, 'Pelto')
    const alerts = [await alert(owner, mokki), await alert(owner, pelto)]

    expect(await runAt(SAT_EVENING)).toMatchObject({ emailsSent: 0, alertsDeferred: 2 })
    expect(await messagesTo(owner)).toHaveLength(0)
    expect(await logOf(owner)).toHaveLength(0)
    expect((await reload(alerts[0]!)).notifiedAt ?? null).toBeNull()

    expect(await runAt(SUN_MORNING)).toMatchObject({ emailsSent: 1, alertsHandled: 2 })
    const [digest] = await waitForAlertEmails(owner, 1)
    const html = (await mailpit.getMessage(digest!.ID)).HTML
    expect(html).toContain('Mökki')
    expect(html).toContain('Pelto')
    expect(html).toContain('Metsänkäyttöilmoitukset-aineistoa')

    const log = await logOf(owner)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'alert_digest', status: 'sent', jobRunId: 'mv-074' })
    expect([...(log[0]!.alerts ?? [])].sort()).toEqual(alerts.map((a) => a.id).sort())
    for (const a of alerts) {
      expect((await reload(a)).notifiedAt).toBe(SUN_MORNING.toISOString())
    }

    // The next morning run has nothing pending for the account.
    expect(await runAt(MON_MORNING)).toMatchObject({ emailsSent: 0 })
  })

  it("weekly: waits through the daily digest runs and goes out on Monday's 09:30 run", async () => {
    const owner = await account('weekly')
    const mokki = await area(owner, 'Mökki')
    const pending = await alert(owner, mokki)

    expect(await runAt(SAT_EVENING)).toMatchObject({ emailsSent: 0, alertsDeferred: 1 })
    expect(await runAt(SUN_MORNING)).toMatchObject({ emailsSent: 0, alertsDeferred: 1 })
    expect(await runAt(MON_MORNING)).toMatchObject({ emailsSent: 1, alertsHandled: 1 })
    expect(await waitForAlertEmails(owner, 1)).toHaveLength(1)
    expect((await logOf(owner))[0]).toMatchObject({ type: 'alert_digest', status: 'sent' })
    expect((await reload(pending)).notifiedAt).toBe(MON_MORNING.toISOString())
  })

  it('sends nothing for a disabled area or an account with notifications off', async () => {
    const owner = await account('immediate')
    const quiet = await area(owner, 'Hiljainen', false)
    const loud = await area(owner, 'Äänekäs')
    const quietAlert = await alert(owner, quiet)
    await alert(owner, loud)

    const muted = await account('immediate', { enabled: false })
    const mutedAlert = await alert(muted, await area(muted, 'Vaimennettu'))

    expect(await runAt(SAT_EVENING)).toMatchObject({ emailsSent: 1, alertsDeferred: 2 })
    const [message] = await waitForAlertEmails(owner, 1)
    expect(message!.Subject).toContain('Äänekäs')
    expect(await messagesTo(muted)).toHaveLength(0)
    expect(await logOf(muted)).toHaveLength(0)
    expect((await reload(quietAlert)).notifiedAt ?? null).toBeNull()
    expect((await reload(mutedAlert)).notifiedAt ?? null).toBeNull()
  })

  it('a failed send leaves the alert pending and logs `failed`; after five failures it stops', async () => {
    const owner = await account('immediate')
    const pending = await alert(owner, await area(owner, 'Mökki'))
    const send = vi
      .spyOn(payload, 'sendEmail')
      .mockRejectedValue(new Error('Provider answered 500 Internal Server Error'))

    const first = await runAt(SAT_EVENING)
    expect(first).toMatchObject({ emailsSent: 0, emailsFailed: 1, alertsHandled: 1 })
    expect((await reload(pending)).notifiedAt ?? null).toBeNull()
    expect(await logOf(owner)).toEqual([
      expect.objectContaining({
        type: 'alert_immediate',
        status: 'failed',
        error: 'Provider answered 500 Internal Server Error',
        alerts: [pending.id],
        sentAt: null,
      }),
    ])

    for (let attempt = 2; attempt <= MAX_ALERT_SEND_ATTEMPTS; attempt++) {
      expect(await runAt(SAT_EVENING)).toMatchObject({ emailsFailed: 1 })
    }
    expect(send).toHaveBeenCalledTimes(MAX_ALERT_SEND_ATTEMPTS)

    // The sixth run does not try again, even with the provider back.
    send.mockRestore()
    expect(await runAt(SAT_EVENING)).toMatchObject({
      emailsSent: 0,
      emailsFailed: 0,
      alertsGivenUp: 1,
    })
    expect(await logOf(owner)).toHaveLength(MAX_ALERT_SEND_ATTEMPTS)
    expect((await reload(pending)).notifiedAt ?? null).toBeNull()
  })

  it('a failed send is retried on the next run and then goes out', async () => {
    const owner = await account('immediate')
    const pending = await alert(owner, await area(owner, 'Mökki'))
    vi.spyOn(payload, 'sendEmail').mockRejectedValueOnce(new Error('SMTP down'))

    expect(await runAt(SAT_EVENING)).toMatchObject({ emailsFailed: 1 })
    expect(await runAt(SUN_MORNING)).toMatchObject({ emailsSent: 1 })
    expect((await reload(pending)).notifiedAt).toBe(SUN_MORNING.toISOString())
    expect((await logOf(owner)).map((r) => r.status)).toEqual(['failed', 'sent'])
  })

  describe('through the pipeline', () => {
    beforeAll(() => {
      server.listen({ onUnhandledRequest: 'bypass' }) // Mailpit + Postgres go over real sockets
    })
    afterAll(() => server.close())
    afterEach(() => {
      server.resetHandlers()
      vi.useRealTimers()
    })

    /** The `send-alerts` step's `job_runs.stats` of a pipeline run. */
    async function sendStats(runId: string) {
      const { docs } = await payload.find({
        collection: 'job-runs',
        where: { and: [{ runId: { equals: runId } }, { task: { equals: 'send-alerts' } }] },
        overrideAccess: true,
      })
      return docs[0]?.stats
    }

    it('runJobNow() passes the Finnish-time digest of the run to send-alerts', async () => {
      server.use(
        http.get(WFS_URL, () =>
          HttpResponse.json({ type: 'FeatureCollection', features: [], numberReturned: 0 }),
        ),
      )
      const owner = await account('daily')
      // The match step adds a `new` alert of its own for the area and the seeded declaration.
      const pending = await alert(owner, await area(owner, 'Mökki'))

      vi.useFakeTimers({ toFake: ['Date'], now: SAT_EVENING })
      const evening = await runJobNow(payload, 'sync-declarations')
      expect(evening.ok).toBe(true)
      expect(await sendStats(evening.runId)).toMatchObject({ emailsSent: 0, alertsHandled: 0 })
      expect((await reload(pending)).notifiedAt ?? null).toBeNull()

      vi.setSystemTime(SUN_MORNING)
      const morning = await runJobNow(payload, 'sync-declarations')
      expect(morning.ok).toBe(true)
      expect(await sendStats(morning.runId)).toMatchObject({ emailsSent: 1, emailsFailed: 0 })
      vi.useRealTimers()

      expect(await waitForAlertEmails(owner, 1)).toHaveLength(1)
      expect((await logOf(owner))[0]).toMatchObject({ type: 'alert_digest', status: 'sent' })
      expect((await reload(pending)).notifiedAt).toBe(SUN_MORNING.toISOString())
    })
  })
})
