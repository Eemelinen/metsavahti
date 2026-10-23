import { expect, test } from './fixtures'

test.describe('API', () => {
  test('health reports the database and PostGIS', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as { ok: boolean; db: string; postgis: string }
    expect(body.ok).toBe(true)
    expect(body.db).toBe('up')
    expect(body.postgis).toMatch(/^3\./)
  })

  test('jobs endpoint requires the cron secret', async ({ request }) => {
    const res = await request.post('/api/jobs/run')
    expect(res.status()).toBe(401)
  })

  test('jobs endpoint runs the sync against the mocked WFS', async ({ request }) => {
    const res = await request.post('/api/jobs/run', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    const body = (await res.json()) as { ok: boolean; status: string; remainingJobs: number }
    expect(body.ok).toBe(true)
    expect(body.remainingJobs).toBe(0)
  })
})
