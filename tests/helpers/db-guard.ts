/**
 * Refuses to run tests against anything that does not look like a test database.
 * Development data must never be touched by a test run.
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url)
    throw new Error(
      'DATABASE_URL is not set for tests (did you run through `dotenv -e .env.test`?)',
    )
  const parsed = new URL(url)
  const dbName = parsed.pathname.replace(/^\//, '')
  const looksLikeTestDb = /(_test|_e2e)$/.test(dbName) || /^test/.test(dbName)
  if (!looksLikeTestDb) {
    throw new Error(
      `Refusing to run tests against database "${dbName}" (${parsed.host}). ` +
        'Test databases must be named *_test or *_e2e. Check .env.test.',
    )
  }
  if (parsed.port === '5432' && !process.env.ALLOW_TESTS_ON_PORT_5432) {
    throw new Error(
      `Refusing to run tests against port 5432 (${parsed.host}/${dbName}) — that is the development database port.`,
    )
  }
  return url
}
