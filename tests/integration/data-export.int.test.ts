import { strFromU8, unzipSync } from 'fflate'
import type { Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { EXPORT_READY_SUBJECT } from '@/emails/ExportReady'
import {
  dataExportDownloadResponse,
  dataExportState,
  requestDataExport,
} from '@/lib/account/data-export'
import { RateLimited } from '@/lib/errors'
import { EXPORT_FILES, signDataExportToken } from '@/lib/jobs/export'
import type { User } from '@/payload-types'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const HOUR_MS = 60 * 60 * 1000

/** The archive behind `link` (or `url`), through the download route's handler. */
async function download(payload: Payload, url: string, now?: Date) {
  const { pathname } = new URL(url)
  const id = pathname.split('/').at(-1)!
  return dataExportDownloadResponse(payload, new Request(url), id, now)
}

async function unzip(response: Response): Promise<Record<string, string>> {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]))
}

/**
 * MV-093: `requestDataExport` → the `export` job → a zip of the five files in `exports`, the
 * `ExportReady` email (Mailpit) with the signed link, and the download route: 200 with the
 * archive, 410 once the link or the request has expired, 403 for a forged or foreign link.
 * One request per day; a failed export can be retried at once.
 */
describe('account data export (MV-093)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)
  let payload: Payload
  let user: User

  /** Ask for an export and run its job, as the route's `after()` does. */
  async function exportNow(account: Pick<User, 'id'>, now?: Date) {
    const { id, jobId } = await requestDataExport(payload, account, now)
    await payload.jobs.runByID({ id: jobId })
    return payload.findByID({
      collection: 'data-export-requests',
      id,
      depth: 0,
      overrideAccess: true,
    })
  }

  /** The download link of the newest `ExportReady` sent to `address`. */
  async function emailedLink(address: string): Promise<string> {
    let link: string | null = null
    await vi.waitFor(
      async () => {
        const [message] = (await mailpit.listMessages())
          .filter((m) => m.To[0]?.Address === address && m.Subject === EXPORT_READY_SUBJECT)
          .sort((a, b) => b.Created.localeCompare(a.Created))
        expect(message).toBeTruthy()
        const full = await mailpit.getMessage(message!.ID)
        expect(full.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
        link = mailpit.extractFirstLink(full.HTML, '/api/account/export/') ?? null
        expect(link).toBeTruthy()
      },
      { timeout: 10_000, interval: 200 },
    )
    return link!.replaceAll('&amp;', '&')
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    await createTestUser(payload, { role: 'admin' })
    user = await createTestUser(payload)
    await payload.create({
      collection: 'watch-areas',
      data: { name: 'Mökkimetsä', center: [27.68, 62.89], radiusM: 800, owner: user.id },
      overrideAccess: true,
    })
    for (const kind of ['terms', 'privacy'] as const) {
      await payload.create({
        collection: 'consent-events',
        data: { user: user.id, kind, version: '2026-09', granted: true, ip: '192.0.2.44' },
        overrideAccess: true,
      })
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds a zip of the five files, emails the link and serves the archive', async () => {
    const request = await exportNow(user)
    expect(request.status).toBe('ready')
    expect(request.file).toBeTruthy()

    const link = await emailedLink(user.email)
    expect(link).toContain(`/api/account/export/${request.id}?token=`)
    const response = await download(payload, link)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('cache-control')).toContain('no-store')

    const files = await unzip(response)
    expect(Object.keys(files).sort()).toEqual([...EXPORT_FILES].sort())

    const account = JSON.parse(files['account.json']!)
    expect(account).toMatchObject({ id: user.id, email: user.email })
    for (const secret of ['hash', 'salt', 'password', 'sessions', 'resetPasswordToken']) {
      expect(account).not.toHaveProperty(secret)
    }

    // RFC 7946: a FeatureCollection with [lng, lat] positions in WGS 84 (here: in Finland).
    const geojson = JSON.parse(files['watch-areas.geojson']!)
    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(1)
    const [area] = geojson.features
    expect(area).toMatchObject({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [27.68, 62.89] },
      properties: { name: 'Mökkimetsä', radiusM: 800 },
    })
    const [lng, lat] = area.geometry.coordinates
    expect(lng).toBeGreaterThanOrEqual(19)
    expect(lng).toBeLessThanOrEqual(32)
    expect(lat).toBeGreaterThanOrEqual(59)
    expect(lat).toBeLessThanOrEqual(71)

    const consents = JSON.parse(files['consents.json']!)
    expect(consents.map((c: { kind: string }) => c.kind)).toEqual(['terms', 'privacy'])
    expect(consents[0]).toMatchObject({ version: '2026-09', granted: true, ip: '192.0.2.0' })
    expect(JSON.parse(files['alerts.json']!)).toEqual([])
    expect(Array.isArray(JSON.parse(files['notifications.json']!))).toBe(true)

    // The send is logged, and the job run is recorded.
    const { docs: log } = await payload.find({
      collection: 'notification-log',
      where: { and: [{ user: { equals: user.id } }, { type: { equals: 'data_export' } }] },
      overrideAccess: true,
    })
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ status: 'sent', recipient: user.email })
    const { docs: runs } = await payload.find({
      collection: 'job-runs',
      where: { task: { equals: 'export' } },
      overrideAccess: true,
    })
    expect(runs[0]).toMatchObject({
      status: 'succeeded',
      stats: { files: 5, emailsSent: 1 },
    })

    // The page shows the ready state with its own link, and refuses another request today.
    const state = await dataExportState(payload, user)
    expect(state.status).toBe('ready')
    expect(state.downloadUrl).toContain(`/api/account/export/${request.id}?token=`)
    expect(state.nextAllowedAt).toBeTruthy()
    expect((await download(payload, state.downloadUrl!)).status).toBe(200)
    await expect(requestDataExport(payload, user)).rejects.toBeInstanceOf(RateLimited)
  })

  it('answers 410 for an expired link and an expired request, 403 for a bad one', async () => {
    const account = await createTestUser(payload)
    const request = await exportNow(account)
    expect(request.status).toBe('ready')
    const link = await emailedLink(account.email)
    expect(link).toContain(`/api/account/export/${request.id}?token=`)

    // Past the 24 h the token itself has expired: Gone.
    const later = new Date(Date.now() + 25 * HOUR_MS)
    const expired = await download(payload, link, later)
    expect(expired.status).toBe(410)
    expect((await expired.json()).error.code).toBe('gone')
    // A link signed long ago and expired an hour ago is Gone as well.
    const old = await signDataExportToken(
      account.id,
      request.id,
      new Date(Date.now() - HOUR_MS),
      new Date(Date.now() - 25 * HOUR_MS),
    )
    const base = new URL(link)
    expect((await download(payload, `${base.origin}${base.pathname}?token=${old}`)).status).toBe(
      410,
    )

    // Forged, missing, or for another request: Forbidden.
    const url = new URL(link)
    const token = url.searchParams.get('token')!
    const forged = `${token.slice(0, -4)}AAAA`
    expect((await download(payload, `${url.origin}${url.pathname}?token=${forged}`)).status).toBe(
      403,
    )
    expect((await download(payload, `${url.origin}${url.pathname}`)).status).toBe(403)
    expect(
      (await download(payload, `${url.origin}/api/account/export/999?token=${token}`)).status,
    ).toBe(403)

    // A token another account got for this request id does not open it.
    const other = await createTestUser(payload)
    const foreign = await signDataExportToken(other.id, request.id, new Date(Date.now() + HOUR_MS))
    expect((await download(payload, `${url.origin}${url.pathname}?token=${foreign}`)).status).toBe(
      403,
    )

    // Once the cleanup has expired the request, the still-valid link is Gone.
    await payload.update({
      collection: 'data-export-requests',
      id: request.id,
      data: { status: 'expired' },
      overrideAccess: true,
    })
    expect((await download(payload, link)).status).toBe(410)
    expect((await dataExportState(payload, account)).status).toBe('expired')
  })

  it('marks a failed export, keeps no file and lets the person ask again', async () => {
    const account = await createTestUser(payload)
    vi.spyOn(payload, 'sendEmail').mockRejectedValueOnce(new Error('SMTP down'))
    const failed = await exportNow(account)
    expect(failed.status).toBe('failed')
    expect(failed.file ?? null).toBeNull()
    const { totalDocs } = await payload.count({
      collection: 'exports',
      where: { user: { equals: account.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
    const { docs: runs } = await payload.find({
      collection: 'job-runs',
      where: { and: [{ task: { equals: 'export' } }, { status: { equals: 'failed' } }] },
      overrideAccess: true,
    })
    expect(runs[0]?.error).toBe('SMTP down')
    expect((await dataExportState(payload, account)).status).toBe('failed')

    const retried = await exportNow(account)
    expect(retried.status).toBe('ready')
  })

  it('keeps a sent export ready when only the notification-log write fails', async () => {
    const account = await createTestUser(payload)
    const create = payload.create.bind(payload)
    vi.spyOn(payload, 'create').mockImplementation(((args: Parameters<Payload['create']>[0]) =>
      args.collection === 'notification-log'
        ? Promise.reject(new Error('log down'))
        : create(args)) as Payload['create'])
    const request = await exportNow(account)
    expect(request.status).toBe('ready')
    const link = await emailedLink(account.email)
    expect((await download(payload, link)).status).toBe(200)
  })

  it('takes JSON only at POST /api/account/export', async () => {
    const { POST } = await import('@/app/api/account/export/route')
    const response = await POST(
      new Request('http://localhost/api/account/export', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'a=1',
      }),
    )
    expect(response.status).toBe(415)
  })

  it('lets an account ask again a day after its last request', async () => {
    const account = await createTestUser(payload)
    const first = await requestDataExport(payload, account)
    // The job never ran (queue not drained): pending, and a second request is refused.
    expect((await dataExportState(payload, account)).status).toBe('pending')
    await expect(requestDataExport(payload, account)).rejects.toMatchObject({ status: 429 })
    const tomorrow = new Date(Date.now() + 24 * HOUR_MS + 60_000)
    expect((await dataExportState(payload, account, tomorrow)).status).toBe('expired')
    const second = await requestDataExport(payload, account, tomorrow)
    expect(second.id).not.toBe(first.id)
  })
})
