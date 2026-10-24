import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import type { JobContext } from '@/lib/jobs/context'
import type { FetchDeclarationsResult } from '@/lib/jobs/fetch-declarations'
import type { MatchWatchAreasResult } from '@/lib/jobs/match-watch-areas'
import { type PipelineSteps, pipelineStatus, runPipeline } from '@/lib/jobs/pipeline'
import type { SendAlertsResult } from '@/lib/jobs/send-alerts'
import { logger } from '@/lib/logger'
import type { WfsClient } from '@/lib/wfs/client'

const fetched: FetchDeclarationsResult = {
  watchAreas: 2,
  bboxes: 1,
  failedBboxes: 0,
  requests: 3,
  features: 40,
  inserted: 5,
  updated: 1,
  removed: 0,
}
const matched: MatchWatchAreasResult = {
  watchAreas: 2,
  matched: 7,
  alertsCreated: 4,
  new: 4,
  geometryChanged: 0,
  attributesChanged: 0,
  removed: 0,
}
const sent: SendAlertsResult = {
  emailsSent: 2,
  emailsFailed: 1,
  alertsHandled: 4,
  alertsDeferred: 0,
  alertsGivenUp: 0,
}

/** A context whose `payload` records the `job_runs` writes `withJobRun()` makes. */
function fakeContext() {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data }))
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data }))
  const ctx: JobContext = {
    payload: { create, update } as unknown as Payload,
    runId: '42',
    logger: logger.child({ test: 'pipeline' }),
    wfs: {} as WfsClient,
    now: () => new Date('2026-10-24T06:30:00Z'),
  }
  const finalRow = () => update.mock.calls.at(-1)![0].data
  return { ctx, create, finalRow }
}

function steps(overrides: Partial<PipelineSteps> = {}) {
  return {
    fetch: vi.fn(async () => fetched),
    match: vi.fn(async () => matched),
    notify: vi.fn(async () => sent),
    ...overrides,
  }
}

/** MV-075: `sync-declarations` runs fetch → match → notify and writes one `pipeline` row. */
describe('runPipeline', () => {
  it('runs the steps in order and records a succeeded summary under the run id', async () => {
    const { ctx, create, finalRow } = fakeContext()
    const order: string[] = []
    const s = steps({
      fetch: async () => (order.push('fetch'), fetched),
      match: async () => (order.push('match'), matched),
      notify: async () => (order.push('notify'), sent),
    })

    const summary = await runPipeline(ctx, s)

    expect(order).toEqual(['fetch', 'match', 'notify'])
    expect(create.mock.calls[0]![0].data).toMatchObject({
      task: 'pipeline',
      runId: '42',
      status: 'running',
    })
    expect(summary).toEqual({
      fetch: 'succeeded',
      match: 'succeeded',
      notify: 'succeeded',
      requests: 3,
      features: 40,
      inserted: 5,
      updated: 1,
      removed: 0,
      failedBboxes: 0,
      alertsCreated: 4,
      emailsSent: 2,
      emailsFailed: 1,
    })
    expect(finalRow()).toMatchObject({ status: 'succeeded', stats: summary })
  })

  it('a partial fetch makes the run partial', async () => {
    const { ctx, finalRow } = fakeContext()
    const summary = await runPipeline(
      ctx,
      steps({ fetch: async () => ({ ...fetched, failedBboxes: 1 }) }),
    )
    expect(summary).toMatchObject({ fetch: 'partial', failedBboxes: 1, notify: 'succeeded' })
    expect(finalRow()).toMatchObject({ status: 'partial' })
  })

  it('a failed fetch still matches and notifies, then rethrows the fetch error', async () => {
    const { ctx, finalRow } = fakeContext()
    const s = steps({ fetch: vi.fn(async () => Promise.reject(new Error('WFS down'))) })

    await expect(runPipeline(ctx, s)).rejects.toThrow('WFS down')

    expect(s.match).toHaveBeenCalledOnce()
    expect(s.notify).toHaveBeenCalledOnce()
    expect(finalRow()).toMatchObject({
      status: 'partial',
      stats: { fetch: 'failed', match: 'succeeded', notify: 'succeeded', requests: 0 },
    })
  })

  it('a failed match skips notify and fails the run', async () => {
    const { ctx, finalRow } = fakeContext()
    const s = steps({ match: vi.fn(async () => Promise.reject(new Error('deadlock'))) })

    await expect(runPipeline(ctx, s)).rejects.toThrow('deadlock')

    expect(s.notify).not.toHaveBeenCalled()
    expect(finalRow()).toMatchObject({
      status: 'failed',
      stats: { fetch: 'succeeded', match: 'failed', notify: 'skipped', alertsCreated: 0 },
    })
  })

  it('a failed notify fails the run', async () => {
    const { ctx, finalRow } = fakeContext()
    const s = steps({ notify: vi.fn(async () => Promise.reject(new Error('db gone'))) })

    await expect(runPipeline(ctx, s)).rejects.toThrow('db gone')
    expect(finalRow()).toMatchObject({ status: 'failed', stats: { notify: 'failed' } })
  })
})

describe('pipelineStatus', () => {
  const base = { fetch: 'succeeded', match: 'succeeded', notify: 'succeeded' } as const
  const summary = (s: Partial<Record<keyof typeof base, string>>) =>
    ({ ...base, ...s }) as unknown as Parameters<typeof pipelineStatus>[0]

  it.each([
    [{}, 'succeeded'],
    [{ fetch: 'partial' }, 'partial'],
    [{ fetch: 'failed' }, 'partial'],
    [{ match: 'failed', notify: 'skipped' }, 'failed'],
    [{ fetch: 'failed', match: 'failed', notify: 'skipped' }, 'failed'],
    [{ notify: 'failed' }, 'failed'],
  ])('%o → %s', (steps, expected) => {
    expect(pipelineStatus(summary(steps))).toBe(expected)
  })
})
