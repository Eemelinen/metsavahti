import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { type MigrateUpArgs, type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import { env } from '@/lib/env'
import type { ConsentEvent, Export, User } from '@/payload-types'
import * as migration from '@/payload/migrations/20260920_153151_logs_consents_exports_job_runs'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const drizzle = async () => ((await getTestPayload()).db as unknown as PostgresAdapter).drizzle

/** Minimal but valid empty zip archive (end-of-central-directory record only). */
const EMPTY_ZIP = Buffer.from('504b0506000000000000000000000000000000000000', 'hex')

const zipFile = (name: string) => ({
  data: EMPTY_ZIP,
  mimetype: 'application/zip',
  name,
  size: EMPTY_ZIP.length,
})

/**
 * MV-035: `notification_log` (`01 §3.6`), `consent_events` (`01 §3.7`, append-only),
 * `data_export_requests` (`01 §3.8`), `job_runs` (`01 §3.9`) and the private `exports`
 * upload collection (`01 §4.5`, local disk in test).
 */
describe('notification_log, consent_events, data_export_requests, job_runs, exports', () => {
  let admin: User
  let owner: User
  let bystander: User
  let ownerConsent: ConsentEvent

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    // Files from an earlier run would make Payload de-duplicate the filename (`-2.zip`).
    rmSync(path.resolve(env.EXPORTS_DIR), { recursive: true, force: true })
    admin = await createTestUser(payload, { role: 'admin' })
    owner = await createTestUser(payload, { role: 'user', name: 'Owner' })
    bystander = await createTestUser(payload, { role: 'user', name: 'Bystander' })

    ownerConsent = await payload.create({
      collection: 'consent-events',
      data: {
        user: owner.id,
        kind: 'privacy',
        version: 'privacy-2026-09',
        granted: true,
        ip: '192.0.2.123',
        userAgent: 'Mozilla/5.0 (test)',
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'consent-events',
      data: { user: bystander.id, kind: 'terms', version: 'terms-2026-09', granted: true },
      overrideAccess: true,
    })
  })

  it('has the 01 §3.6–3.9 tables and columns; notification_log lost `channel`', async () => {
    const db = await drizzle()
    const columnsOf = async (table: string) =>
      (
        await db.execute<{ column_name: string }>(sql`
          SELECT column_name FROM information_schema.columns WHERE table_name = ${table}
        `)
      ).rows.map((c) => c.column_name)

    const notificationLog = await columnsOf('notification_log')
    expect(notificationLog).toEqual(
      expect.arrayContaining([
        'user_id',
        'type',
        'recipient',
        'provider',
        'provider_message_id',
        'status',
        'error',
        'sent_at',
        'job_run_id',
      ]),
    )
    expect(notificationLog).not.toContain('channel')
    expect(await columnsOf('consent_events')).toEqual(
      expect.arrayContaining([
        'user_id',
        'kind',
        'version',
        'granted',
        'ip',
        'user_agent',
        'created_at',
      ]),
    )
    expect(await columnsOf('data_export_requests')).toEqual(
      expect.arrayContaining(['user_id', 'status', 'file_id', 'expires_at', 'created_at']),
    )
    expect(await columnsOf('job_runs')).toEqual(
      expect.arrayContaining(['task', 'started_at', 'finished_at', 'status', 'stats', 'error']),
    )
    expect(await columnsOf('exports')).toEqual(
      expect.arrayContaining(['user_id', 'filename', 'mime_type', 'filesize', 'url']),
    )

    const { rows: indexes } = await db.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes WHERE tablename IN ('job_runs', 'notification_log', 'exports')
    `)
    expect(indexes.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        'task_startedAt_idx',
        'job_runs_started_at_idx',
        'notification_log_type_idx',
        'notification_log_status_idx',
        'exports_filename_idx',
      ]),
    )
  })

  it('consent event cannot be updated (ticket test) nor deleted, not even with overrideAccess', async () => {
    const payload = await getTestPayload()

    // Access control: no update/delete for anyone, admins included.
    await expect(
      payload.update({
        collection: 'consent-events',
        id: ownerConsent.id,
        data: { granted: false },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: 'consent-events',
        id: ownerConsent.id,
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Hooks: the Local API with overrideAccess (jobs, scripts) cannot rewrite history either.
    await expect(
      payload.update({
        collection: 'consent-events',
        id: ownerConsent.id,
        data: { granted: false },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/append-only/)
    await expect(
      payload.delete({ collection: 'consent-events', id: ownerConsent.id, overrideAccess: true }),
    ).rejects.toThrow(/append-only/)

    const unchanged = await payload.findByID({
      collection: 'consent-events',
      id: ownerConsent.id,
      overrideAccess: true,
    })
    expect(unchanged.granted).toBe(true)
    expect(unchanged.version).toBe('privacy-2026-09')
  })

  it('consent events: IP stored as a /24 prefix; owner reads own rows only; no client create', async () => {
    const payload = await getTestPayload()
    expect(ownerConsent.ip).toBe('192.0.2.0')
    expect(ownerConsent.granted).toBe(true)

    const mine = await payload.find({
      collection: 'consent-events',
      user: owner,
      overrideAccess: false,
    })
    expect(mine.docs.map((d) => d.id)).toEqual([ownerConsent.id])

    const theirs = await payload.find({
      collection: 'consent-events',
      user: bystander,
      overrideAccess: false,
    })
    expect(theirs.docs.map((d) => d.id)).not.toContain(ownerConsent.id)

    await expect(
      payload.find({ collection: 'consent-events', overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'consent-events',
        data: { user: owner.id, kind: 'marketing', version: 'privacy-2026-09', granted: true },
        user: owner,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(
      (await payload.count({ collection: 'consent-events', overrideAccess: true })).totalDocs,
    ).toBe(2)
  })

  it('exports: zip only, file on local disk under EXPORTS_DIR, readable by the owner only', async () => {
    const payload = await getTestPayload()
    const doc: Export = await payload.create({
      collection: 'exports',
      data: { user: owner.id },
      file: zipFile('metsavahti-export-owner.zip'),
      overrideAccess: true,
    })
    expect(doc.mimeType).toBe('application/zip')
    expect(doc.filename).toBe('metsavahti-export-owner.zip')
    expect(doc.url).toBe(
      `${env.NEXT_PUBLIC_SERVER_URL}/api/exports/file/metsavahti-export-owner.zip`,
    )
    expect(existsSync(path.resolve(env.EXPORTS_DIR, doc.filename!))).toBe(true)

    await expect(
      payload.create({
        collection: 'exports',
        data: { user: owner.id },
        file: { ...zipFile('not-a-zip.txt'), mimetype: 'text/plain' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()

    const mine = await payload.find({ collection: 'exports', user: owner, overrideAccess: false })
    expect(mine.docs.map((d) => d.id)).toEqual([doc.id])
    const theirs = await payload.find({
      collection: 'exports',
      user: bystander,
      overrideAccess: false,
    })
    expect(theirs.totalDocs).toBe(0)
    await expect(payload.find({ collection: 'exports', overrideAccess: false })).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'exports',
        data: { user: owner.id },
        file: zipFile('metsavahti-export-owner-2.zip'),
        user: owner,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('data export requests: `pending` column default, linked file, owner read only', async () => {
    const payload = await getTestPayload()
    const db = await drizzle()
    const { rows: defaults } = await db.execute<{ table_name: string; column_default: string }>(sql`
      SELECT table_name, column_default FROM information_schema.columns
      WHERE column_name = 'status' AND table_name IN ('data_export_requests', 'job_runs')
      ORDER BY table_name
    `)
    expect(defaults.map((d) => d.column_default)).toEqual([
      expect.stringContaining("'pending'"),
      expect.stringContaining("'running'"),
    ])

    const file = await payload.find({ collection: 'exports', overrideAccess: true })
    const request = await payload.create({
      collection: 'data-export-requests',
      data: {
        user: owner.id,
        status: 'pending',
        file: file.docs[0]!.id,
        expiresAt: '2026-09-21T12:00:00.000Z',
      },
      overrideAccess: true,
    })
    expect(request.status).toBe('pending')

    const mine = await payload.find({
      collection: 'data-export-requests',
      user: owner,
      overrideAccess: false,
      depth: 1,
    })
    expect(mine.docs.map((d) => d.id)).toEqual([request.id])
    expect((mine.docs[0]!.file as Export).filename).toBe('metsavahti-export-owner.zip')

    const theirs = await payload.find({
      collection: 'data-export-requests',
      user: bystander,
      overrideAccess: false,
    })
    expect(theirs.totalDocs).toBe(0)
    await expect(
      payload.create({
        collection: 'data-export-requests',
        data: { user: owner.id, status: 'pending', expiresAt: '2026-09-21T12:00:00.000Z' },
        user: owner,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('job runs: admin read-only, stats as JSON', async () => {
    const payload = await getTestPayload()
    const run = await payload.create({
      collection: 'job-runs',
      data: {
        task: 'fetch-declarations',
        status: 'running',
        startedAt: '2026-09-20T09:00:00.000Z',
      },
      overrideAccess: true,
    })
    expect(run.status).toBe('running')

    const finished = await payload.update({
      collection: 'job-runs',
      id: run.id,
      data: {
        status: 'succeeded',
        finishedAt: '2026-09-20T09:01:00.000Z',
        stats: { requests: 3, features: 12, upserts: 12 },
      },
      overrideAccess: true,
    })
    expect(finished.stats).toEqual({ requests: 3, features: 12, upserts: 12 })

    const asAdmin = await payload.find({
      collection: 'job-runs',
      user: admin,
      overrideAccess: false,
    })
    expect(asAdmin.totalDocs).toBe(1)
    await expect(
      payload.find({ collection: 'job-runs', user: owner, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'job-runs',
        data: { task: 'cleanup', status: 'running', startedAt: '2026-09-20T09:00:00.000Z' },
        user: admin,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'job-runs', id: run.id, user: admin, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('notification log: 01 §3.6 fields, admin-only read', async () => {
    const payload = await getTestPayload()
    const row = await payload.create({
      collection: 'notification-log',
      data: {
        user: owner.id,
        type: 'verify_email',
        recipient: owner.email,
        provider: 'nodemailer',
        providerMessageId: '<abc@metsavahti.test>',
        status: 'sent',
        sentAt: '2026-09-20T10:00:00.000Z',
      },
      overrideAccess: true,
    })
    expect(row.type).toBe('verify_email')
    expect(row.status).toBe('sent')

    await expect(
      payload.find({ collection: 'notification-log', user: owner, overrideAccess: false }),
    ).rejects.toThrow()
    const asAdmin = await payload.find({
      collection: 'notification-log',
      user: admin,
      overrideAccess: false,
    })
    expect(asAdmin.docs.map((d) => d.id)).toEqual([row.id])
  })

  it('migration round-trip restores `channel` and backfills the new columns (runs last)', async () => {
    const payload = await getTestPayload()
    const db = await drizzle()
    const args = { db } as unknown as MigrateUpArgs

    const failed = await payload.create({
      collection: 'notification-log',
      data: { user: owner.id, type: 'alert_immediate', provider: 'resend', status: 'failed' },
      overrideAccess: true,
    })

    await migration.down(args)
    const { rows: oldShape } = await db.execute<{ channel: string; column_count: number }>(sql`
      SELECT channel::text AS channel,
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_name = 'notification_log' AND column_name IN ('type', 'provider', 'sent_at')) AS column_count
      FROM notification_log WHERE id = ${failed.id}
    `)
    expect(oldShape[0]).toEqual({ channel: 'email', column_count: 0 })
    const { rows: tables } = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM pg_tables
      WHERE tablename IN ('consent_events', 'data_export_requests', 'job_runs', 'exports')
    `)
    expect(tables[0]!.n).toBe(0)

    await migration.up(args)
    const { rows: converted } = await db.execute<{
      id: number
      type: string
      provider: string
      sent_at_is_created: boolean | null
    }>(sql`
      SELECT id, type::text AS type, provider, sent_at = created_at AS sent_at_is_created
      FROM notification_log ORDER BY id
    `)
    // The earlier `sent` row gets sent_at = created_at; the failed one keeps sent_at NULL.
    expect(converted).toEqual([
      {
        id: expect.any(Number),
        type: 'alert_immediate',
        provider: 'email',
        sent_at_is_created: true,
      },
      { id: failed.id, type: 'alert_immediate', provider: 'email', sent_at_is_created: null },
    ])
    expect(
      (await payload.count({ collection: 'consent-events', overrideAccess: true })).totalDocs,
    ).toBe(0)
  })
})
