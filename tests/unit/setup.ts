import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from '../helpers/msw'

// Unit tests have no database: every limiter counts in memory instead of `rate_limit_buckets`.
// Component tests (jsdom) skip it: the limiter reads the server-only env.
if (typeof window === 'undefined') {
  const { memoryRateLimitStore, setDefaultRateLimitStore } = await import('@/lib/rate-limit')
  setDefaultRateLimitStore(memoryRateLimitStore())
}

// Unit tests must never hit the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
