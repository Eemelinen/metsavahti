import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { env } from '@/lib/env'
import { server } from '../helpers/msw'
import { getTestPayload, resetDatabase } from '../helpers/payload'
import { loadWfsFixture, wfsResponseForBbox } from '../helpers/wfs-fixture'

describe('POST /api/jobs/run', () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' })
    server.use(
      http.get('http://wfs.test/rajapinnat/v1/ows/', () =>
        HttpResponse.json(wfsResponseForBbox(loadWfsFixture(), null)),
      ),
    )
    await resetDatabase(await getTestPayload())
  })
  afterAll(() => server.close())

  async function post(headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/jobs/run/route')
    return POST(new Request('http://localhost/api/jobs/run', { method: 'POST', headers }))
  }

  it('rejects requests without the cron secret', async () => {
    expect((await post()).status).toBe(401)
    expect((await post({ authorization: 'Bearer wrong' })).status).toBe(401)
  })

  it('runs the workflow with the cron secret and drains the queue', async () => {
    const res = await post({ authorization: `Bearer ${env.CRON_SECRET}` })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; status: string; remainingJobs: number }
    expect(body.ok).toBe(true)
    expect(body.remainingJobs).toBe(0)
  })
})
