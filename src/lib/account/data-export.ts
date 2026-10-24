import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { type Payload, createLocalReq } from 'payload'

import { exportDownloadUrl } from '@/emails/ExportReady'
import { env } from '@/lib/env'
import { Forbidden, Gone, RateLimited, toErrorResponse } from '@/lib/errors'
import { signDataExportToken } from '@/lib/jobs/export'
import { checkToken } from '@/lib/tokens'
import type { DataExportRequest, Export, User } from '@/payload-types'

/** One export request per account per day (ticket MV-093). */
export const DATA_EXPORT_INTERVAL_MS = 24 * 60 * 60 * 1000

export type DataExportStatus = DataExportRequest['status']

/**
 * The request's status as the person should see it now: the weekly cleanup is what writes
 * `expired`, so a `pending` or `ready` request past its `expiresAt` already counts as expired.
 */
export function effectiveExportStatus(
  request: Pick<DataExportRequest, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): DataExportStatus {
  const live = request.status === 'pending' || request.status === 'ready'
  return live && new Date(request.expiresAt) <= now ? 'expired' : request.status
}

async function latestRequests(payload: Payload, userId: number, limit: number) {
  const { docs } = await payload.find({
    collection: 'data-export-requests',
    where: { user: { equals: userId } },
    sort: '-createdAt',
    depth: 0,
    limit,
    overrideAccess: true,
  })
  return docs
}

/**
 * When the account may ask again, or `null` if it may now. A request that is still pending or
 * ready blocks until it expires; any other request except a failed one blocks for a day from
 * when it was made. A failed one blocks nothing, so the person can retry at once.
 */
function nextAllowedAt(requests: DataExportRequest[], now: Date): Date | null {
  let until = 0
  for (const request of requests) {
    if (request.status === 'failed') continue
    const status = effectiveExportStatus(request, now)
    if (status === 'pending' || status === 'ready') {
      until = Math.max(until, new Date(request.expiresAt).getTime())
    }
    until = Math.max(until, new Date(request.createdAt).getTime() + DATA_EXPORT_INTERVAL_MS)
  }
  return until > now.getTime() ? new Date(until) : null
}

export type DataExportState = {
  /** `none` when the account has never asked. */
  status: DataExportStatus | 'none'
  /** Pending: when the request lapses; ready: when the link stops working. */
  expiresAt: string | null
  /** Only while ready: a freshly signed link to the archive, valid until `expiresAt`. */
  downloadUrl: string | null
  /** Set while a new request would be refused (MV-093: one per day). */
  nextAllowedAt: string | null
}

/** The export section of `/tili/tietosuoja`: the latest request and whether a new one is allowed. */
export async function dataExportState(
  payload: Payload,
  user: Pick<User, 'id'>,
  now: Date = new Date(),
): Promise<DataExportState> {
  const requests = await latestRequests(payload, user.id, 5)
  const next = nextAllowedAt(requests, now)
  const [latest] = requests
  if (!latest) return { status: 'none', expiresAt: null, downloadUrl: null, nextAllowedAt: null }
  const status = effectiveExportStatus(latest, now)
  const downloadUrl =
    status === 'ready'
      ? exportDownloadUrl(
          env.NEXT_PUBLIC_SERVER_URL,
          latest.id,
          await signDataExportToken(user.id, latest.id, new Date(latest.expiresAt), now),
        )
      : null
  return {
    status,
    expiresAt: status === 'pending' || status === 'ready' ? latest.expiresAt : null,
    downloadUrl,
    nextAllowedAt: next ? next.toISOString() : null,
  }
}

export type DataExportRequested = { id: number; jobId: string }

/**
 * `POST /api/account/export` (`01 §6`, MV-093): store a `pending` request (lapsing in a day if
 * the job never runs) and queue the `export` job for it. Refused with `RateLimited` while an
 * earlier request is pending or ready, or was made less than a day ago. The caller runs the
 * queued job; the cron's queue drain (`POST /api/jobs/run`) picks it up otherwise.
 */
export async function requestDataExport(
  payload: Payload,
  user: Pick<User, 'id'>,
  now: Date = new Date(),
): Promise<DataExportRequested> {
  const next = nextAllowedAt(await latestRequests(payload, user.id, 5), now)
  if (next) throw new RateLimited((next.getTime() - now.getTime()) / 1000)

  const request = await payload.create({
    collection: 'data-export-requests',
    data: {
      user: user.id,
      status: 'pending',
      expiresAt: new Date(now.getTime() + DATA_EXPORT_INTERVAL_MS).toISOString(),
    },
    overrideAccess: true,
  })
  const job = await payload.jobs.queue({ task: 'export', input: { requestId: request.id } })
  return { id: request.id, jobId: String(job.id) }
}

/**
 * The archive's bytes, from wherever the `exports` collection stores files: the storage
 * adapter's handler when S3 is on (D-013), otherwise `EXPORTS_DIR` on local disk.
 */
async function exportFileBody(payload: Payload, file: Export): Promise<BodyInit> {
  const upload = payload.collections.exports.config.upload
  const filename = file.filename ?? ''
  if (upload.handlers?.length) {
    const req = await createLocalReq({}, payload)
    for (const handler of upload.handlers) {
      const response = await handler(req, {
        doc: file,
        headers: new Headers(),
        params: { collection: 'exports', filename },
      })
      if (response instanceof Response && response.ok && response.body) return response.body
    }
  }
  const dir = path.resolve(upload.staticDir ?? env.EXPORTS_DIR)
  const filePath = path.resolve(dir, filename)
  if (!filename || !filePath.startsWith(dir + path.sep)) throw new Error('Invalid export file')
  return new Uint8Array(await readFile(filePath))
}

/**
 * `GET /api/account/export/[id]?token=` (MV-093): the archive behind a signed `data-export`
 * link. The token is the access check (no session needed, as for the email's map image): a
 * missing, forged or other-purpose token, or one for another request, is 403; a genuine token
 * past its 24 hours, or a request that is expired, failed or has lost its file, is 410 Gone.
 */
export async function dataExportDownloadResponse(
  payload: Payload,
  request: Request,
  idParam: string,
  now: Date = new Date(),
): Promise<Response> {
  try {
    const requestId = /^[1-9]\d{0,9}$/.test(idParam) ? Number(idParam) : null
    const token = new URL(request.url).searchParams.get('token')
    const checked = token ? await checkToken('data-export', token, now) : null
    if (!checked || checked.status === 'invalid' || requestId === null) throw new Forbidden()
    if (checked.claims.jti !== String(requestId)) throw new Forbidden()
    if (checked.status === 'expired') throw new Gone()

    const exportRequest = await payload.findByID({
      collection: 'data-export-requests',
      id: requestId,
      depth: 1,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!exportRequest) throw new Gone()
    const ownerId =
      typeof exportRequest.user === 'object' ? exportRequest.user.id : exportRequest.user
    if (String(ownerId) !== checked.claims.sub) throw new Forbidden()
    const file = typeof exportRequest.file === 'object' ? exportRequest.file : null
    if (effectiveExportStatus(exportRequest, now) !== 'ready' || !file) throw new Gone()

    return new Response(await exportFileBody(payload, file), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="metsavahti-tiedot-${requestId}.zip"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
