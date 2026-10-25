import {
  type Payload,
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
} from 'payload'

import {
  LEGAL_DOCUMENT_PATHS,
  type LegalDocumentSlug,
  findLatestLegalDocument,
} from '@/lib/legal/documents'
import type { ReacceptanceInput } from '@/lib/legal/reacceptance-schema'
import type { User } from '@/payload-types'

/** The documents an account accepts (registration writes their consent events, `01 §3.7`). */
export const REACCEPTANCE_SLUGS = ['terms', 'privacy'] as const satisfies LegalDocumentSlug[]
export type ReacceptanceSlug = (typeof REACCEPTANCE_SLUGS)[number]

/** One published document whose version the account has not accepted. */
export type PendingDocument = {
  slug: ReacceptanceSlug
  title: string
  version: string
  href: string
  changeSummary: string | null
  requiresReacceptance: boolean
}

export type Reacceptance = {
  documents: PendingDocument[]
  /** Some pending document has `requiresReacceptance`: the prompt is a blocking modal. */
  blocking: boolean
}

export type ConsentContext = { ip: string | null; userAgent: string | null }

/** The version of each document the account last accepted (`granted` consent events). */
async function acceptedVersions(
  payload: Payload,
  userId: number,
): Promise<Partial<Record<ReacceptanceSlug, string>>> {
  const { docs } = await payload.find({
    collection: 'consent-events',
    where: {
      and: [
        { user: { equals: userId } },
        { kind: { in: [...REACCEPTANCE_SLUGS] } },
        { granted: { equals: true } },
      ],
    },
    sort: ['-createdAt', '-id'],
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const versions: Partial<Record<ReacceptanceSlug, string>> = {}
  for (const event of docs) {
    const kind = event.kind as ReacceptanceSlug
    versions[kind] ??= event.version
  }
  return versions
}

/**
 * What `ReacceptanceBanner` shows (`01 §3.10`, MV-086): every published terms / privacy
 * document whose version differs from the one in the account's latest `granted` consent event
 * of that kind (an account with no such event has accepted nothing). `null` when nothing is
 * pending. The prompt blocks when the latest version of a pending document has
 * `requiresReacceptance`.
 */
export async function loadReacceptance(
  payload: Payload,
  user: Pick<User, 'id'>,
  now: Date = new Date(),
): Promise<Reacceptance | null> {
  const [accepted, ...latest] = await Promise.all([
    acceptedVersions(payload, user.id),
    ...REACCEPTANCE_SLUGS.map((slug) => findLatestLegalDocument(payload, slug, now)),
  ])
  const documents: PendingDocument[] = []
  REACCEPTANCE_SLUGS.forEach((slug, i) => {
    const doc = latest[i]
    if (!doc || accepted[slug] === doc.version) return
    documents.push({
      slug,
      title: doc.title,
      version: doc.version,
      href: LEGAL_DOCUMENT_PATHS[slug],
      changeSummary: doc.changeSummary?.trim() || null,
      requiresReacceptance: doc.requiresReacceptance,
    })
  })
  if (documents.length === 0) return null
  return { documents, blocking: documents.some((d) => d.requiresReacceptance) }
}

/**
 * "Hyväksyn": one `granted` consent event per document at the version the prompt showed. If a
 * newer version was published since (`outdated`), nothing is written, so an account never
 * accepts a text it was not shown. Documents already accepted at that version are skipped, so a
 * second click writes nothing. All rows go in one transaction.
 */
export async function acceptLegalDocuments(
  payload: Payload,
  user: Pick<User, 'id'>,
  input: ReacceptanceInput,
  context: ConsentContext,
  now: Date = new Date(),
): Promise<{ status: 'accepted'; written: number } | { status: 'outdated' }> {
  const accepted = await acceptedVersions(payload, user.id)
  const toWrite: { kind: ReacceptanceSlug; version: string }[] = []
  for (const { slug, version } of input.documents) {
    const latest = await findLatestLegalDocument(payload, slug, now)
    if (!latest || latest.version !== version) return { status: 'outdated' }
    if (accepted[slug] !== version) toWrite.push({ kind: slug, version })
  }

  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    for (const { kind, version } of toWrite) {
      await payload.create({
        collection: 'consent-events',
        data: {
          user: user.id,
          kind,
          version,
          granted: true,
          ip: context.ip,
          userAgent: context.userAgent,
        },
        overrideAccess: true,
        req,
      })
    }
    await commitTransaction(req)
  } catch (error) {
    await killTransaction(req)
    throw error
  }
  return { status: 'accepted', written: toWrite.length }
}
