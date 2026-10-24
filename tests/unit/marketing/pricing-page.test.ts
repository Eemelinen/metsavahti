import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `/hinnoittelu` is served only with `SHOW_PRICING=1` (MV-101). The e2e suite runs with the
 * flag on (`.env.test`), so this guards the production default: flag off is a 404.
 */
const testEnv = { SHOW_PRICING: '0' }

vi.mock('@/lib/env', () => ({ env: testEnv }))

async function renderRoute() {
  vi.resetModules()
  const { default: page } = await import('@/app/(frontend)/(marketing)/hinnoittelu/page')
  return () => page()
}

afterEach(() => {
  testEnv.SHOW_PRICING = '0'
})

describe('/hinnoittelu (MV-101)', () => {
  it('is a 404 when SHOW_PRICING is off', async () => {
    const render = await renderRoute()
    expect(render).toThrow(expect.objectContaining({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }))
  })

  it('renders the plan cards when SHOW_PRICING is on', async () => {
    testEnv.SHOW_PRICING = '1'
    const render = await renderRoute()
    expect(render).not.toThrow()
    expect(render()).toBeTruthy()
  })
})
