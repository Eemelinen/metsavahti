import type { Payload } from 'payload'

import type { LegalDocument } from '@/payload-types'

/** The four documents `01 §3.10` names; `consent_events.kind` uses the same slugs. */
export const LEGAL_DOCUMENT_SLUGS = ['privacy', 'terms', 'cookies', 'accessibility'] as const
export type LegalDocumentSlug = (typeof LEGAL_DOCUMENT_SLUGS)[number]

export const LEGAL_DOCUMENT_TITLES: Record<LegalDocumentSlug, string> = {
  privacy: 'Tietosuojaseloste',
  terms: 'Käyttöehdot',
  cookies: 'Evästekäytäntö',
  accessibility: 'Saavutettavuusseloste',
}

/** Public page of each document (`03-pages.md` → (legal)); also its canonical URL and sitemap entry. */
export const LEGAL_DOCUMENT_PATHS: Record<LegalDocumentSlug, string> = {
  privacy: '/tietosuoja',
  terms: '/kayttoehdot',
  cookies: '/evasteet',
  accessibility: '/saavutettavuus',
}

/** Version string of the placeholder seed (MV-036); MV-092 replaces it with `2026-09`. */
export const PLACEHOLDER_VERSION = '2026-09-draft'

type RichText = LegalDocument['body']

function paragraph(text: string): RichText['root']['children'][number] {
  return {
    type: 'paragraph',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    children: [{ type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' }],
  }
}

function heading(text: string): RichText['root']['children'][number] {
  return { ...paragraph(text), type: 'heading', tag: 'h2' }
}

function root(children: RichText['root']['children']): RichText {
  return { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } }
}

/** Lexical editor state with one paragraph per string (what the seed and tests write). */
export function richTextFromParagraphs(...texts: string[]): RichText {
  return root(texts.map(paragraph))
}

/**
 * Lexical editor state with lead paragraphs and `h2` sections, the shape the legal pages turn
 * into a table of contents (MV-091).
 */
export function richTextFromSections(
  intro: string[],
  sections: { title: string; paragraphs: string[] }[],
): RichText {
  return root([
    ...intro.map(paragraph),
    ...sections.flatMap((section) => [
      heading(section.title),
      ...section.paragraphs.map(paragraph),
    ]),
  ])
}

/**
 * The version pages render and registration references: the newest `publishedAt` that is
 * not in the future (`01 §3.10`). Unpublished rows (`publishedAt` empty) never resolve.
 * Runs with `overrideAccess` so server code can resolve it for anonymous visitors.
 */
export async function findLatestLegalDocument(
  payload: Payload,
  slug: LegalDocumentSlug,
  at: Date = new Date(),
): Promise<LegalDocument | null> {
  const { docs } = await payload.find({
    collection: 'legal-documents',
    where: {
      and: [{ slug: { equals: slug } }, { publishedAt: { less_than_equal: at.toISOString() } }],
    },
    sort: ['-publishedAt', '-createdAt'],
    limit: 1,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/**
 * Create the four placeholder documents at `PLACEHOLDER_VERSION` unless a row with that
 * (slug, version) already exists. Idempotent, so `pnpm db:seed` and the tests can call it
 * repeatedly. The placeholders are published at `publishedAt` (default: now) so that the
 * legal pages and the registration consent rows have a version to reference before MV-092
 * ships the real text. Returns the documents that were created.
 */
export async function seedLegalDocuments(
  payload: Payload,
  { publishedAt = new Date() }: { publishedAt?: Date } = {},
): Promise<LegalDocument[]> {
  const created: LegalDocument[] = []
  for (const slug of LEGAL_DOCUMENT_SLUGS) {
    const existing = await payload.count({
      collection: 'legal-documents',
      where: { and: [{ slug: { equals: slug } }, { version: { equals: PLACEHOLDER_VERSION } }] },
      overrideAccess: true,
    })
    if (existing.totalDocs > 0) continue
    const title = LEGAL_DOCUMENT_TITLES[slug]
    created.push(
      await payload.create({
        collection: 'legal-documents',
        data: {
          slug,
          title,
          version: PLACEHOLDER_VERSION,
          publishedAt: publishedAt.toISOString(),
          requiresReacceptance: false,
          changeSummary: 'Paikkamerkkiversio ennen lopullista tekstiä.',
          body: richTextFromParagraphs(
            `${title} – luonnos.`,
            'Tämä on paikkamerkkiteksti. Lopullinen sisältö lisätään ennen julkaisua ja tarkistetaan oikeudellisesti.',
          ),
        },
        overrideAccess: true,
      }),
    )
  }
  return created
}
