import { describe, expect, it } from 'vitest'

import { assertTestDatabaseUrl } from '../helpers/db-guard'

describe('assertTestDatabaseUrl (dev data protection)', () => {
  it('accepts the e2e and Testcontainers-style test databases', () => {
    expect(assertTestDatabaseUrl('postgres://u:p@localhost:5433/metsavahti_e2e')).toBeTruthy()
    expect(assertTestDatabaseUrl('postgres://u:p@localhost:55017/metsavahti_test')).toBeTruthy()
  })

  it('refuses the development database name', () => {
    expect(() => assertTestDatabaseUrl('postgres://u:p@localhost:5433/metsavahti')).toThrow(
      /Refusing to run tests against database "metsavahti"/,
    )
  })

  it('refuses the development port even with a test-looking name', () => {
    expect(() => assertTestDatabaseUrl('postgres://u:p@localhost:5432/metsavahti_test')).toThrow(
      /port 5432/,
    )
  })

  it('refuses a missing URL', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL is not set/)
  })
})
