import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig } from 'payload'

import { env } from '@/lib/env'
import { emailProvider } from '@/lib/notifications/provider'
import {
  Alerts,
  ConsentEvents,
  DataExportRequests,
  DeclarationRevisions,
  Declarations,
  Exports,
  JobRuns,
  LegalDocuments,
  NotificationLog,
  Users,
  WatchAreaDeclarations,
  WatchAreas,
} from '@/payload/collections'
import { canRunJobs } from '@/payload/jobs/access'
import { tasks } from '@/payload/jobs/tasks'
import { workflows } from '@/payload/jobs/workflows'
import { migrations } from '@/payload/migrations'
import { addPostgisColumns } from '@/payload/schema/postgis'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** "Name <addr@example.com>" → { name, address } */
function parseFrom(from: string): { defaultFromName: string; defaultFromAddress: string } {
  const match = /^(.*)<([^>]+)>\s*$/.exec(from)
  if (match) return { defaultFromName: match[1]!.trim(), defaultFromAddress: match[2]!.trim() }
  return { defaultFromName: 'Metsävahti', defaultFromAddress: from.trim() }
}

function emailAdapter() {
  const from = parseFrom(env.EMAIL_FROM)
  switch (emailProvider()) {
    case 'nodemailer':
      return nodemailerAdapter({
        ...from,
        transportOptions: { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false },
      })
    case 'resend':
      return resendAdapter({ ...from, apiKey: env.RESEND_API_KEY! })
    default:
      return undefined
  }
}

/**
 * Export archives live on local disk (`EXPORTS_DIR`) unless `S3_BUCKET` is set, in which
 * case the S3 adapter takes over the `exports` collection (D-013). The plugin is always
 * registered so the schema is identical in every environment; `enabled` decides the store.
 */
function exportsStorage() {
  const enabled = Boolean(env.S3_BUCKET)
  if (enabled && !(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)) {
    throw new Error('S3_BUCKET is set but S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are missing')
  }
  return s3Storage({
    enabled,
    bucket: env.S3_BUCKET ?? 'unused',
    collections: { exports: true },
    config: {
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
      },
    },
  })
}

export default buildConfig({
  serverURL: env.NEXT_PUBLIC_SERVER_URL,
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · Metsävahti' },
  },
  collections: [
    Users,
    WatchAreas,
    Declarations,
    DeclarationRevisions,
    WatchAreaDeclarations,
    Alerts,
    NotificationLog,
    ConsentEvents,
    DataExportRequests,
    Exports,
    JobRuns,
    LegalDocuments,
  ],
  // One editor for every richText field (legal_documents.body); admin UI + JSON storage.
  editor: lexicalEditor(),
  secret: env.PAYLOAD_SECRET,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: env.DATABASE_URL },
    // `CREATE EXTENSION IF NOT EXISTS postgis` runs before every `migrate` (CLI and boot), so the
    // extension exists before the first geometry column regardless of migration order (MV-030).
    extensions: ['postgis'],
    // Schema comes exclusively from committed migrations in every environment.
    push: false,
    migrationDir: path.resolve(dirname, 'payload/migrations'),
    prodMigrations: migrations,
    afterSchemaInit: [addPostgisColumns],
  }),
  email: emailAdapter(),
  plugins: [exportsStorage()],
  jobs: {
    tasks,
    workflows,
    access: { run: canRunJobs },
  },
})
