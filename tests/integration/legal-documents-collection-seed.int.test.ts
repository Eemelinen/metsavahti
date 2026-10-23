import { type MigrateUpArgs, type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { beforeAll, describe, expect, it } from 'vitest'

import {
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENT_TITLES,
  type LegalDocumentSlug,
  PLACEHOLDER_VERSION,
  findLatestLegalDocument,
  richTextFromParagraphs,
  seedLegalDocuments,
} from '@/lib/legal/documents'
import type { User } from '@/payload-types'
import * as migration from '@/payload/migrations/20260920_162232_legal_documents'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const drizzle = async () => ((await getTestPayload()).db as unknown as PostgresAdapter).drizzle

const docData = (slug: LegalDocumentSlug, version: string, publishedAt: string | null = null) => ({
  slug,
  title: LEGAL_DOCUMENT_TITLES[slug],
  version,
  publishedAt,
  requiresReacceptance: false,
  body: richTextFromParagraphs(version),
})

/**
 * MV-036: `legal_documents` (`01 §3.10`), one row per (slug, version), the placeholder seed
 * at `2026-09-draft` and the "latest published version" resolver the pages and the
 * registration flow depend on.
 */
describe('legal_documents collection + seed', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
  // Relative to the clock so the "not in the future" rule is what is tested, not the calendar.
  const seededAt = daysAgo(30)
  let admin: User
  let user: User

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    admin = await createTestUser(payload, { role: 'admin' })
    user = await createTestUser(payload, { role: 'user' })
    await seedLegalDocuments(payload, { publishedAt: seededAt })
  })

  it('has the 01 §3.10 columns and a unique (slug, version) index', async () => {
    const db = await drizzle()
    const { rows: columns } = await db.execute<{ column_name: string; data_type: string }>(sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'legal_documents'
        AND column_name IN ('title', 'slug', 'version', 'published_at', 'requires_reacceptance', 'change_summary', 'body')
      ORDER BY column_name
    `)
    expect(columns).toEqual([
      { column_name: 'body', data_type: 'jsonb' },
      { column_name: 'change_summary', data_type: 'character varying' },
      { column_name: 'published_at', data_type: 'timestamp with time zone' },
      { column_name: 'requires_reacceptance', data_type: 'boolean' },
      { column_name: 'slug', data_type: 'USER-DEFINED' },
      { column_name: 'title', data_type: 'character varying' },
      { column_name: 'version', data_type: 'character varying' },
    ])

    const { rows: indexes } = await db.execute<{ indexname: string; indexdef: string }>(sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'legal_documents' AND indexname IN ('slug_version_idx', 'legal_documents_published_at_idx')
      ORDER BY indexname
    `)
    expect(indexes.map((i) => i.indexname)).toEqual([
      'legal_documents_published_at_idx',
      'slug_version_idx',
    ])
    expect(indexes[1]!.indexdef).toMatch(/^CREATE UNIQUE INDEX .*\(slug, version\)$/)
  })

  it('seeds the four placeholder documents once', async () => {
    const payload = await getTestPayload()
    const { docs } = await payload.find({
      collection: 'legal-documents',
      sort: 'slug',
      overrideAccess: true,
    })
    expect(docs.map((d) => d.slug).sort()).toEqual([...LEGAL_DOCUMENT_SLUGS].sort())
    for (const doc of docs) {
      expect(doc.version).toBe(PLACEHOLDER_VERSION)
      expect(doc.publishedAt).toBe(seededAt.toISOString())
      expect(doc.requiresReacceptance).toBe(false)
      expect(doc.title.length).toBeGreaterThan(0)
      // The rich-text body survives the jsonb round-trip as a Lexical editor state.
      const [first] = doc.body.root.children as unknown as { children: { text: string }[] }[]
      expect(first!.children[0]!.text).toContain(doc.title)
    }

    // Idempotent: a second run creates nothing.
    expect(await seedLegalDocuments(payload, { publishedAt: seededAt })).toEqual([])
    const { totalDocs } = await payload.count({
      collection: 'legal-documents',
      overrideAccess: true,
    })
    expect(totalDocs).toBe(4)
  })

  it('rejects a second row with the same (slug, version)', async () => {
    const payload = await getTestPayload()
    await expect(
      payload.create({
        collection: 'legal-documents',
        data: docData('terms', PLACEHOLDER_VERSION),
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('resolves the latest published version per slug', async () => {
    const payload = await getTestPayload()
    const create = (version: string, publishedAt: string | null) =>
      payload.create({
        collection: 'legal-documents',
        data: docData('privacy', version, publishedAt),
        overrideAccess: true,
      })
    await create('2026-10', daysAgo(10).toISOString())
    await create('2026-11-draft', null) // unpublished
    await create('2099-01', '2099-01-01T00:00:00.000Z') // scheduled, not yet live

    expect((await findLatestLegalDocument(payload, 'privacy'))?.version).toBe('2026-10')
    expect((await findLatestLegalDocument(payload, 'terms'))?.version).toBe(PLACEHOLDER_VERSION)
    // Time travel: before 2026-10 the placeholder was current; before the seed nothing was.
    expect((await findLatestLegalDocument(payload, 'privacy', daysAgo(20)))?.version).toBe(
      PLACEHOLDER_VERSION,
    )
    expect(await findLatestLegalDocument(payload, 'privacy', daysAgo(40))).toBeNull()
  })

  it('anyone reads published versions, admins read every version, only admins write', async () => {
    const payload = await getTestPayload()
    const versionsFor = async (who?: User) => {
      const { docs } = await payload.find({
        collection: 'legal-documents',
        where: { slug: { equals: 'privacy' } },
        sort: 'version',
        user: who,
        overrideAccess: false,
      })
      return docs.map((d) => d.version)
    }
    expect(await versionsFor()).toEqual([PLACEHOLDER_VERSION, '2026-10'])
    expect(await versionsFor(user)).toEqual([PLACEHOLDER_VERSION, '2026-10'])
    expect(await versionsFor(admin)).toEqual([
      PLACEHOLDER_VERSION,
      '2026-10',
      '2026-11-draft',
      '2099-01',
    ])

    const data = docData('cookies', '2026-10')
    await expect(
      payload.create({ collection: 'legal-documents', data, user, overrideAccess: false }),
    ).rejects.toThrow()
    const created = await payload.create({
      collection: 'legal-documents',
      data,
      user: admin,
      overrideAccess: false,
    })
    await expect(
      payload.update({
        collection: 'legal-documents',
        id: created.id,
        data: { changeSummary: 'nope' },
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: 'legal-documents',
        id: created.id,
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const updated = await payload.update({
      collection: 'legal-documents',
      id: created.id,
      data: { requiresReacceptance: true },
      user: admin,
      overrideAccess: false,
    })
    expect(updated.requiresReacceptance).toBe(true)
  })

  it('migration round-trip drops and recreates the table (runs last)', async () => {
    const payload = await getTestPayload()
    const db = await drizzle()
    const args = { db } as unknown as MigrateUpArgs

    await migration.down(args)
    const { rows: gone } = await db.execute<{ tables: number; enums: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM pg_tables WHERE tablename = 'legal_documents') AS tables,
        (SELECT count(*)::int FROM pg_type WHERE typname = 'enum_legal_documents_slug') AS enums
    `)
    expect(gone[0]).toEqual({ tables: 0, enums: 0 })

    await migration.up(args)
    const seeded = await seedLegalDocuments(payload, { publishedAt: seededAt })
    expect(seeded.map((d) => d.slug).sort()).toEqual([...LEGAL_DOCUMENT_SLUGS].sort())
    expect((await findLatestLegalDocument(payload, 'accessibility'))?.version).toBe(
      PLACEHOLDER_VERSION,
    )
  })
})
