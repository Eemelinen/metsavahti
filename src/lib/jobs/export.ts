import { type Zippable, strToU8, zipSync } from 'fflate'
import type { Payload } from 'payload'

import { EXPORT_READY_SUBJECT, renderExportReady } from '@/emails/ExportReady'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { formatSessionTime } from '@/lib/account/sessions'
import { env } from '@/lib/env'
import type { JobContext } from '@/lib/jobs/context'
import { emailProvider } from '@/lib/notifications/provider'
import { signToken } from '@/lib/tokens'
import type { Alert, ConsentEvent, NotificationLog, User, WatchArea } from '@/payload-types'

/** The download link and the stored archive live this long after the archive is built (`01 §4.5`). */
export const EXPORT_LINK_TTL_SECONDS = 24 * 60 * 60

/** The archive's files, in the order the ticket lists them (`01 §4.5`). */
export const EXPORT_FILES = [
  'account.json',
  'watch-areas.geojson',
  'alerts.json',
  'consents.json',
  'notifications.json',
] as const

export type ExportFileName = (typeof EXPORT_FILES)[number]

export type DataExportResult = { files: number; bytes: number; emailsSent: number }

const idOf = (value: number | { id: number } | null | undefined): number | null =>
  value == null ? null : typeof value === 'object' ? value.id : value

/** Everything the account owns in one collection, oldest first. */
async function findOwn<T>(
  payload: Payload,
  collection: 'watch-areas' | 'alerts' | 'consent-events' | 'notification-log',
  ownerField: string,
  userId: number,
): Promise<T[]> {
  const { docs } = await payload.find({
    collection,
    where: { [ownerField]: { equals: userId } },
    sort: 'createdAt',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs as T[]
}

/**
 * The account row as the person sees it in the app. Credentials, tokens, sessions and the
 * pending email-change token stay out: they are secrets, not personal data about the user.
 */
export function accountJson(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    locale: user.locale ?? null,
    timezone: user.timezone ?? null,
    plan: user.plan ?? null,
    role: user.role,
    emailVerified: Boolean(user._verified),
    pendingEmail: user.pendingEmail ?? null,
    marketingConsent: user.marketingConsent ?? false,
    marketingConsentAt: user.marketingConsentAt ?? null,
    notificationPrefs: user.notificationPrefs ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/**
 * The watch areas as a GeoJSON FeatureCollection in WGS 84 (RFC 7946, `[lng, lat]`): one Point
 * per area at its centre, with the radius and the settings as properties. The centre is stored
 * in WGS 84 already (Payload point field); the PostGIS buffer is derived from it.
 */
export function watchAreasGeoJson(areas: WatchArea[]) {
  return {
    type: 'FeatureCollection' as const,
    features: areas.map((area) => ({
      type: 'Feature' as const,
      id: area.id,
      geometry: { type: 'Point' as const, coordinates: [area.center[0], area.center[1]] },
      properties: {
        name: area.name,
        radiusM: area.radiusM,
        addressLabel: area.addressLabel ?? null,
        notificationsEnabled: area.notificationsEnabled ?? true,
        lastCheckedAt: area.lastCheckedAt ?? null,
        createdAt: area.createdAt,
        updatedAt: area.updatedAt,
      },
    })),
  }
}

export function alertsJson(alerts: Alert[]) {
  return alerts.map((alert) => ({
    id: alert.id,
    watchArea: idOf(alert.watchArea),
    declaration: idOf(alert.declaration),
    changeType: alert.changeType,
    snapshot: alert.snapshot ?? null,
    createdAt: alert.createdAt,
    notifiedAt: alert.notifiedAt ?? null,
    readAt: alert.readAt ?? null,
  }))
}

export function consentsJson(events: ConsentEvent[]) {
  return events.map((event) => ({
    kind: event.kind,
    version: event.version,
    granted: event.granted,
    ip: event.ip ?? null,
    userAgent: event.userAgent ?? null,
    createdAt: event.createdAt,
  }))
}

export function notificationsJson(rows: NotificationLog[]) {
  return rows.map((row) => ({
    type: row.type,
    status: row.status,
    recipient: row.recipient ?? null,
    alerts: (row.alerts ?? []).map((alert) => idOf(alert)),
    error: row.error ?? null,
    sentAt: row.sentAt ?? null,
    createdAt: row.createdAt,
  }))
}

/** The five files of an account's export, as pretty-printed JSON (`01 §4.5`). */
export async function buildDataExportFiles(
  payload: Payload,
  userId: number,
): Promise<Record<ExportFileName, string>> {
  const user = await payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
  })
  const [areas, alerts, consents, notifications] = await Promise.all([
    findOwn<WatchArea>(payload, 'watch-areas', 'owner', userId),
    findOwn<Alert>(payload, 'alerts', 'user', userId),
    findOwn<ConsentEvent>(payload, 'consent-events', 'user', userId),
    findOwn<NotificationLog>(payload, 'notification-log', 'user', userId),
  ])
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
  return {
    'account.json': json(accountJson(user)),
    'watch-areas.geojson': json(watchAreasGeoJson(areas)),
    'alerts.json': json(alertsJson(alerts)),
    'consents.json': json(consentsJson(consents)),
    'notifications.json': json(notificationsJson(notifications)),
  }
}

/** A deflated zip of `files` (fflate, in memory: an account's data is kilobytes). */
export function zipDataExport(files: Record<string, string>, at: Date = new Date()): Uint8Array {
  const entries: Zippable = {}
  for (const [name, text] of Object.entries(files)) entries[name] = [strToU8(text), { mtime: at }]
  return zipSync(entries, { level: 6 })
}

/**
 * The `export` job (`01 §4.5`, MV-093): build the account's archive, store it in the private
 * `exports` collection, mark the request `ready` for 24 hours from now and email the signed
 * download link (`ExportReady`), logging the send in `notification-log` as `data_export`. Any
 * failure up to and including the send marks the request `failed` and removes its file, so the
 * page offers a new request; the error is rethrown so `withJobRun` records it. A request that
 * is no longer `pending` is left alone (Payload's `processing` flag keeps two runners off one
 * job).
 */
export async function runDataExport(ctx: JobContext, requestId: number): Promise<DataExportResult> {
  const { payload, logger, now } = ctx
  const request = await payload.findByID({
    collection: 'data-export-requests',
    id: requestId,
    depth: 0,
    overrideAccess: true,
  })
  if (request.status !== 'pending') return { files: 0, bytes: 0, emailsSent: 0 }
  const userId = idOf(request.user)!

  let fileId: number | null = null
  try {
    const at = now()
    const files = await buildDataExportFiles(payload, userId)
    const zip = zipDataExport(files, at)
    const file = await payload.create({
      collection: 'exports',
      data: { user: userId },
      file: {
        data: Buffer.from(zip),
        mimetype: 'application/zip',
        name: `metsavahti-tiedot-${requestId}.zip`,
        size: zip.byteLength,
      },
      overrideAccess: true,
    })
    fileId = file.id
    const expiresAt = new Date(at.getTime() + EXPORT_LINK_TTL_SECONDS * 1000)
    await payload.update({
      collection: 'data-export-requests',
      id: requestId,
      data: { status: 'ready', file: file.id, expiresAt: expiresAt.toISOString() },
      overrideAccess: true,
    })

    const user = await payload.findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
    })
    const emailsSent = await sendExportReady(ctx, user, {
      requestId,
      files: Object.keys(files),
      sizeBytes: zip.byteLength,
      expiresAt,
      at,
    })
    return { files: Object.keys(files).length, bytes: zip.byteLength, emailsSent }
  } catch (error) {
    logger.error({ err: error, requestId }, 'data export failed')
    await markExportFailed(ctx, requestId, fileId)
    throw error
  }
}

/**
 * Mark the request `failed` and delete its file (the cleanup only sweeps pending / ready
 * requests, so a failed one must not keep a file). Best effort: when the database is the
 * reason the export failed, these writes fail too, and the caller's original error is the one
 * that must reach `withJobRun`; the request then lapses at its `expiresAt` as a pending one.
 */
async function markExportFailed(
  { payload, logger }: JobContext,
  requestId: number,
  fileId: number | null,
): Promise<void> {
  try {
    await payload.update({
      collection: 'data-export-requests',
      id: requestId,
      data: { status: 'failed', file: null },
      overrideAccess: true,
    })
    if (fileId !== null) {
      await payload.delete({ collection: 'exports', id: fileId, overrideAccess: true })
    }
  } catch (err) {
    logger.error({ err, requestId, fileId }, 'could not mark the data export failed')
  }
}

/** The signed `data-export` link for a request, valid until `expiresAt`. */
export function signDataExportToken(
  userId: number,
  requestId: number,
  expiresAt: Date,
  now: Date = new Date(),
): Promise<string> {
  const ttl = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
  return signToken('data-export', { sub: String(userId), jti: String(requestId) }, ttl, now)
}

async function sendExportReady(
  { payload, logger, runId }: JobContext,
  user: User,
  archive: { requestId: number; files: string[]; sizeBytes: number; expiresAt: Date; at: Date },
): Promise<number> {
  const token = await signDataExportToken(user.id, archive.requestId, archive.expiresAt, archive.at)
  const email = await renderExportReady({
    requestId: archive.requestId,
    token,
    files: archive.files,
    sizeBytes: archive.sizeBytes,
    expiresAt: formatSessionTime(
      archive.expiresAt.toISOString(),
      user.timezone ?? DEFAULT_TIMEZONE,
    ),
    baseUrl: env.NEXT_PUBLIC_SERVER_URL,
  })
  // A failed send fails the job: without the email the person never learns the link.
  await payload.sendEmail({ to: user.email, subject: EXPORT_READY_SUBJECT, ...email })
  // After a successful send the link is out, so a failed log write must not fail the export
  // (that would delete the file behind the link).
  try {
    await payload.create({
      collection: 'notification-log',
      data: {
        type: 'data_export',
        user: user.id,
        recipient: user.email,
        provider: emailProvider(),
        status: 'sent',
        sentAt: archive.at.toISOString(),
        jobRunId: runId,
      },
      overrideAccess: true,
    })
  } catch (err) {
    logger.error({ err, requestId: archive.requestId }, 'could not log the export email')
  }
  return 1
}
