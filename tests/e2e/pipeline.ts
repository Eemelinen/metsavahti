import type { APIRequestContext } from '@playwright/test'

import { expect } from './fixtures'

/**
 * `POST /api/jobs/run` with the cron secret. The browser projects run pipelines at the same
 * time; a trigger during another run gets 409 from the pipeline lock (MV-075) and tries again
 * once that run is over, so the run that answers 200 started after the caller's area existed.
 */
export async function runPipeline(request: APIRequestContext): Promise<void> {
  const run = () =>
    request.post('/api/jobs/run', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
  let res = await run()
  await expect
    .poll(async () => (res.status() === 409 ? (res = await run()).status() : res.status()), {
      intervals: [1_000],
      timeout: 120_000,
    })
    .not.toBe(409)
  expect(res.ok(), await res.text()).toBeTruthy()
}
