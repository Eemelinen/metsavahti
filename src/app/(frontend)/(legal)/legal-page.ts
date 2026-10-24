import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import {
  LEGAL_DOCUMENT_PATHS,
  LEGAL_DOCUMENT_TITLES,
  type LegalDocumentSlug,
  findLatestLegalDocument,
} from '@/lib/legal/documents'
import type { LegalDocument } from '@/payload-types'

/**
 * `<title>` and canonical URL of a legal page; the heading itself is the document's own
 * `title`.
 */
export function legalMetadata(slug: LegalDocumentSlug): Metadata {
  return {
    title: LEGAL_DOCUMENT_TITLES[slug],
    alternates: { canonical: LEGAL_DOCUMENT_PATHS[slug] },
  }
}

/**
 * The latest published version of `slug` (`01 §3.10`), or the 404 page while none is
 * published. Every frontend page renders per request (root layout), so a new version shows
 * up on the next visit.
 */
export async function loadLegalDocument(slug: LegalDocumentSlug): Promise<LegalDocument> {
  const payload = await getPayload({ config })
  return (await findLatestLegalDocument(payload, slug)) ?? notFound()
}
