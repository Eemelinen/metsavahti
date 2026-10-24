import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'

import { DECLARATION_ALERT_GRACE_DAYS, type RetentionRuleId, retention } from '@/config/retention'
import type { JobContext } from '@/lib/jobs/context'

/** Rows removed (or, for exports, requests expired) per retention rule. */
export type CleanupResult = Record<RetentionRuleId, number>

const DAY_MS = 24 * 60 * 60 * 1000

function daysBefore(at: Date, days: number): string {
  return new Date(at.getTime() - days * DAY_MS).toISOString()
}

type CleanupHandler = (ctx: JobContext, at: Date) => Promise<number>

/**
 * One handler per rule in `config/retention.ts`; the `Record` type makes a rule without a
 * handler a type error (MV-097 checks the same at runtime). Bulk deletes are plain SQL:
 * `alerts.declaration` and `declaration_revisions.declaration` cascade (D-026), so deleting a
 * declaration takes its old alerts, revisions and join rows with it.
 */
const handlers: Record<RetentionRuleId, CleanupHandler> = {
  declarations: async ({ payload }, at) => {
    const { rowCount } = await drizzle(payload).execute(sql`
      DELETE FROM declarations d
      WHERE d.valid_until < ${daysBefore(at, retention.declarations.days)}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM alerts a
          WHERE a.declaration_id = d.id
            AND a.created_at >= ${daysBefore(at, DECLARATION_ALERT_GRACE_DAYS)}::timestamptz
        )
    `)
    return rowCount ?? 0
  },

  declarationRevisions: async ({ payload }, at) => {
    const { rowCount } = await drizzle(payload).execute(sql`
      DELETE FROM declaration_revisions
      WHERE changed_at < ${daysBefore(at, retention.declarationRevisions.days)}::timestamptz
    `)
    return rowCount ?? 0
  },

  // Through the Local API: deleting an `exports` document also removes its file (disk or S3).
  dataExports: async ({ payload }, at) => {
    const { docs } = await payload.find({
      collection: 'data-export-requests',
      where: {
        and: [
          { expiresAt: { less_than_equal: daysBefore(at, retention.dataExports.days) } },
          { status: { in: ['pending', 'ready'] } },
        ],
      },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    for (const request of docs) {
      await payload.update({
        collection: 'data-export-requests',
        id: request.id,
        data: { status: 'expired', file: null },
        overrideAccess: true,
      })
      const fileId = typeof request.file === 'object' ? request.file?.id : request.file
      if (fileId) await payload.delete({ collection: 'exports', id: fileId, overrideAccess: true })
    }
    return docs.length
  },

  jobRuns: async ({ payload }, at) => {
    const { rowCount } = await drizzle(payload).execute(sql`
      DELETE FROM job_runs
      WHERE started_at < ${daysBefore(at, retention.jobRuns.days)}::timestamptz
    `)
    return rowCount ?? 0
  },

  // Requests sweep these too, but only on an instance that gets traffic (D-021).
  rateLimitBuckets: async ({ payload }, at) => {
    const { rowCount } = await drizzle(payload).execute(sql`
      DELETE FROM rate_limit_buckets
      WHERE expires_at <= ${daysBefore(at, retention.rateLimitBuckets.days)}::timestamptz
    `)
    return rowCount ?? 0
  },
}

function drizzle(payload: JobContext['payload']) {
  return (payload.db as unknown as PostgresAdapter).drizzle
}

/** The weekly `cleanup` task (`01 §4.4`): applies every retention rule once, in order. */
export async function cleanup(ctx: JobContext): Promise<CleanupResult> {
  const at = ctx.now()
  const result = {} as CleanupResult
  for (const [rule, handler] of Object.entries(handlers) as [RetentionRuleId, CleanupHandler][]) {
    result[rule] = await handler(ctx, at)
  }
  ctx.logger.info(result, 'cleanup done')
  return result
}
