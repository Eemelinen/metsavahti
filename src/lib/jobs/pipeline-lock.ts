import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** The advisory lock's name; Postgres hashes it to the lock key (`hashtext`). */
const PIPELINE_LOCK = 'metsavahti:sync-declarations'

/** Another `sync-declarations` run holds the lock; `POST /api/jobs/run` answers 409. */
export class PipelineAlreadyRunning extends Error {
  constructor() {
    super('a sync-declarations run is already in progress')
    this.name = 'PipelineAlreadyRunning'
  }
}

/**
 * Run `fn` while holding the pipeline's session-level advisory lock (MV-075), so two runs
 * never overlap: a second trigger fails at once with `PipelineAlreadyRunning` instead of
 * waiting. The lock lives on a connection of its own, held for the whole run; if the process
 * dies, Postgres drops the connection and the lock with it.
 */
export async function withPipelineLock<T>(payload: Payload, fn: () => Promise<T>): Promise<T> {
  const client = await (payload.db as unknown as PostgresAdapter).pool.connect()
  let broken = false
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [PIPELINE_LOCK],
    )
    if (!rows[0]?.locked) throw new PipelineAlreadyRunning()
    try {
      return await fn()
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [PIPELINE_LOCK]).catch(() => {
        // Closing the connection below releases the lock instead.
        broken = true
      })
    }
  } finally {
    client.release(broken)
  }
}
