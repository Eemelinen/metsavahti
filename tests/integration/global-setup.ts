import { GenericContainer, Wait } from 'testcontainers'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

import { runMigrations } from '../helpers/db'

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string
    smtpPort: number
    mailpitApiUrl: string
  }
}

/**
 * One throwaway PostGIS + Mailpit per integration run (Testcontainers → Docker Desktop).
 * Nothing here ever touches the docker compose `db` used for development.
 */
export default async function globalSetup(project: TestProject) {
  const started = Date.now()

  const [postgres, mailpit] = await Promise.all([
    new PostgreSqlContainer('postgis/postgis:16-3.4')
      .withDatabase('metsavahti_test')
      .withUsername('metsavahti')
      .withPassword('metsavahti')
      .withCommand([
        'postgres',
        '-c',
        'fsync=off',
        '-c',
        'synchronous_commit=off',
        '-c',
        'full_page_writes=off',
      ])
      .start(),
    new GenericContainer('axllent/mailpit:latest')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/livez', 8025))
      .start(),
  ])

  const databaseUrl = postgres.getConnectionUri()
  const smtpPort = mailpit.getMappedPort(1025)
  const mailpitApiUrl = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`

  runMigrations(databaseUrl)

  project.provide('databaseUrl', databaseUrl)
  project.provide('smtpPort', smtpPort)
  project.provide('mailpitApiUrl', mailpitApiUrl)
  console.log(`[integration] containers ready in ${Date.now() - started} ms (${databaseUrl})`)

  return async () => {
    await Promise.all([postgres.stop(), mailpit.stop()])
  }
}
