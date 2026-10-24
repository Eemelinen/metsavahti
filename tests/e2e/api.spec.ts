import { expect, test } from './fixtures'

test.describe('API', () => {
  test('health reports the database and PostGIS', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { ok: boolean; db: string; postgis: string; stale: boolean }
    expect(body.ok).toBe(true)
    expect(body.db).toBe('up')
    expect(body.postgis).toMatch(/^3\./)
    expect(typeof body.stale).toBe('boolean')
  })

  test('jobs endpoint requires the cron secret', async ({ request }) => {
    const res = await request.post('/api/jobs/run')
    expect(res.status()).toBe(401)
  })

  test('jobs endpoint runs the sync against the mocked WFS', async ({ request }) => {
    const run = () =>
      request.post('/api/jobs/run', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    // The projects run this test at the same time; a trigger during another project's run
    // gets 409 from the pipeline lock (MV-075) and tries again once that run is over.
    let res = await run()
    await expect
      .poll(async () => (res.status() === 409 ? (res = await run()).status() : res.status()), {
        intervals: [1_000],
        timeout: 120_000,
      })
      .not.toBe(409)
    expect(res.ok(), await res.text()).toBeTruthy()
    const body = (await res.json()) as { ok: boolean; status: string; remainingJobs: number }
    expect(body.ok).toBe(true)
    expect(body.remainingJobs).toBe(0)
  })
})
