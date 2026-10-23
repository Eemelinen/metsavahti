import { describe, expect, it } from 'vitest'

import { env } from '@/lib/env'
import { hasValidCronSecret } from '@/payload/jobs/access'

describe('hasValidCronSecret', () => {
  it('accepts the configured bearer token only', () => {
    expect(hasValidCronSecret(`Bearer ${env.CRON_SECRET}`)).toBe(true)
    expect(hasValidCronSecret(`Bearer ${env.CRON_SECRET}x`)).toBe(false)
    expect(hasValidCronSecret('Bearer nope')).toBe(false)
    expect(hasValidCronSecret(env.CRON_SECRET)).toBe(false)
    expect(hasValidCronSecret(null)).toBe(false)
  })
})
