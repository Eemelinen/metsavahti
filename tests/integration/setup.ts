import { inject } from 'vitest'

import { assertTestDatabaseUrl } from '../helpers/db-guard'

// Runs in the worker before any test file imports the Payload config, so the
// env module picks up the Testcontainers endpoints instead of .env.test values.
process.env.DATABASE_URL = assertTestDatabaseUrl(inject('databaseUrl'))
process.env.SMTP_HOST = 'localhost'
process.env.SMTP_PORT = String(inject('smtpPort'))
process.env.MAILPIT_API_URL = inject('mailpitApiUrl')
process.env.WFS_BASE_URL = 'http://wfs.test/rajapinnat/v1/ows/'
