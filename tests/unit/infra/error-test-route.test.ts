import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `/virhe` exists so the e2e suite can render `error.tsx`. This guards the other half of
 * its contract: without `ENABLE_ERROR_TEST_ROUTE=1` it must behave like any unknown URL.
 */
const testEnv = { ENABLE_ERROR_TEST_ROUTE: '0' }

vi.mock('@/lib/env', () => ({ env: testEnv }))

async function renderRoute() {
  vi.resetModules()
  const { default: page } = await import('@/app/(frontend)/(marketing)/virhe/page')
  return () => page()
}

afterEach(() => {
  testEnv.ENABLE_ERROR_TEST_ROUTE = '0'
})

describe('/virhe (error boundary test route)', () => {
  it('is a 404 when the test hook is off', async () => {
    const render = await renderRoute()
    expect(render).toThrow(expect.objectContaining({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }))
  })

  it('throws a plain error when the test hook is on', async () => {
    testEnv.ENABLE_ERROR_TEST_ROUTE = '1'
    const render = await renderRoute()
    expect(render).toThrow(/ENABLE_ERROR_TEST_ROUTE=1/)
    expect(render).not.toThrow(expect.objectContaining({ digest: expect.any(String) }))
  })

  it('is rendered per request so a build never prerenders the throw', async () => {
    const route = await import('@/app/(frontend)/(marketing)/virhe/page')
    expect(route.dynamic).toBe('force-dynamic')
  })
})
