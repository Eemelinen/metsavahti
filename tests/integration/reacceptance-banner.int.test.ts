import { beforeEach, describe, expect, it } from 'vitest'

import {
  PLACEHOLDER_VERSION,
  richTextFromParagraphs,
  seedLegalDocuments,
} from '@/lib/legal/documents'
import { acceptLegalDocuments, loadReacceptance } from '@/lib/legal/reacceptance'
import type { User } from '@/payload-types'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const CONTEXT = { ip: '203.0.113.77', userAgent: 'Vitest' }
const HOUR = 60 * 60 * 1000

async function publish(
  slug: 'terms' | 'privacy' | 'cookies',
  version: string,
  {
    requiresReacceptance = false,
    publishedAt = new Date(Date.now() - 1000),
    changeSummary = `Muutokset versiossa ${version}.`,
  }: { requiresReacceptance?: boolean; publishedAt?: Date; changeSummary?: string } = {},
) {
  const payload = await getTestPayload()
  return payload.create({
    collection: 'legal-documents',
    data: {
      slug,
      title:
        slug === 'terms' ? 'Käyttöehdot' : slug === 'privacy' ? 'Tietosuojaseloste' : 'Evästeet',
      version,
      publishedAt: publishedAt.toISOString(),
      requiresReacceptance,
      changeSummary,
      body: richTextFromParagraphs(`${slug} ${version}`),
    },
    overrideAccess: true,
  })
}

/** What registration writes (`registerUser()`): terms and privacy at the given version. */
async function acceptedAt(
  user: User,
  version: string,
  kinds: ('terms' | 'privacy')[] = ['terms', 'privacy'],
) {
  const payload = await getTestPayload()
  for (const kind of kinds) {
    await payload.create({
      collection: 'consent-events',
      data: { user: user.id, kind, version, granted: true },
      overrideAccess: true,
    })
  }
}

async function eventsOf(userId: number) {
  const payload = await getTestPayload()
  const { docs } = await payload.find({
    collection: 'consent-events',
    where: { user: { equals: userId } },
    sort: ['createdAt', 'id'],
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

/**
 * MV-086: `loadReacceptance()` compares the account's latest accepted terms / privacy versions
 * with the published `legal-documents`; "Hyväksyn" (`acceptLegalDocuments()`) appends one
 * `granted` consent event per shown document, and refuses a version that is no longer current.
 */
describe('re-acceptance banner (MV-086)', () => {
  let user: User

  beforeEach(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await seedLegalDocuments(payload, { publishedAt: new Date(Date.now() - 2 * HOUR) })
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    await createTestUser(payload, { role: 'admin' })
    user = await createTestUser(payload)
    await acceptedAt(user, PLACEHOLDER_VERSION)
  })

  it('shows nothing while the account has accepted the published versions', async () => {
    await expect(loadReacceptance(await getTestPayload(), user)).resolves.toBeNull()
  })

  it('returns the banner data once a new terms version is published', async () => {
    await publish('terms', '2026-10')

    const data = await loadReacceptance(await getTestPayload(), user)
    expect(data).toEqual({
      blocking: false,
      documents: [
        {
          slug: 'terms',
          title: 'Käyttöehdot',
          version: '2026-10',
          href: '/kayttoehdot',
          changeSummary: 'Muutokset versiossa 2026-10.',
          requiresReacceptance: false,
        },
      ],
    })
  })

  it('blocks when a pending document requires re-acceptance', async () => {
    await publish('terms', '2026-10')
    await publish('privacy', '2026-10', { requiresReacceptance: true, changeSummary: '  ' })

    const data = await loadReacceptance(await getTestPayload(), user)
    expect(data?.blocking).toBe(true)
    // A blank change summary counts as none (the banner then links to the full text).
    expect(data?.documents.map((d) => [d.slug, d.requiresReacceptance, d.changeSummary])).toEqual([
      ['terms', false, 'Muutokset versiossa 2026-10.'],
      ['privacy', true, null],
    ])
  })

  it('ignores scheduled versions, cookie-policy versions and other accounts', async () => {
    const payload = await getTestPayload()
    await publish('terms', '2026-11', { publishedAt: new Date(Date.now() + HOUR) })
    await publish('cookies', '2026-10')
    const other = await createTestUser(payload)
    await publish('privacy', '2026-10')
    await acceptedAt(other, PLACEHOLDER_VERSION, ['terms'])
    await acceptedAt(other, '2026-10', ['privacy'])

    const data = await loadReacceptance(payload, user)
    expect(data?.documents.map((d) => [d.slug, d.version])).toEqual([['privacy', '2026-10']])
    await expect(loadReacceptance(payload, other)).resolves.toBeNull()
  })

  it('treats an account without consent events as not having accepted anything', async () => {
    const payload = await getTestPayload()
    const fresh = await createTestUser(payload)

    const data = await loadReacceptance(payload, fresh)
    expect(data?.documents.map((d) => [d.slug, d.version])).toEqual([
      ['terms', PLACEHOLDER_VERSION],
      ['privacy', PLACEHOLDER_VERSION],
    ])
  })

  it('accept writes a granted consent event per document and clears the banner', async () => {
    const payload = await getTestPayload()
    await publish('terms', '2026-10')
    await publish('privacy', '2026-10', { requiresReacceptance: true })
    const before = (await eventsOf(user.id)).length

    const result = await acceptLegalDocuments(
      payload,
      user,
      {
        documents: [
          { slug: 'terms', version: '2026-10' },
          { slug: 'privacy', version: '2026-10' },
        ],
      },
      CONTEXT,
    )
    expect(result).toEqual({ status: 'accepted', written: 2 })

    const written = (await eventsOf(user.id)).slice(before)
    expect(written.map((e) => [e.kind, e.version, e.granted])).toEqual([
      ['terms', '2026-10', true],
      ['privacy', '2026-10', true],
    ])
    // The IP is stored as its network prefix (`truncateIp()`), the user agent as is.
    expect(written[0]?.ip).toBe('203.0.113.0')
    expect(written[0]?.userAgent).toBe('Vitest')
    await expect(loadReacceptance(payload, user)).resolves.toBeNull()

    // A second click (or a double submit) records nothing new.
    await expect(
      acceptLegalDocuments(
        payload,
        user,
        { documents: [{ slug: 'terms', version: '2026-10' }] },
        CONTEXT,
      ),
    ).resolves.toEqual({ status: 'accepted', written: 0 })
    expect(await eventsOf(user.id)).toHaveLength(before + 2)
  })

  it('refuses a version that is no longer the latest and writes nothing', async () => {
    const payload = await getTestPayload()
    await publish('terms', '2026-10')
    await publish('terms', '2026-11')
    const before = (await eventsOf(user.id)).length

    await expect(
      acceptLegalDocuments(
        payload,
        user,
        {
          documents: [
            { slug: 'privacy', version: PLACEHOLDER_VERSION },
            { slug: 'terms', version: '2026-10' },
          ],
        },
        CONTEXT,
      ),
    ).resolves.toEqual({ status: 'outdated' })
    expect(await eventsOf(user.id)).toHaveLength(before)

    const data = await loadReacceptance(payload, user)
    expect(data?.documents.map((d) => d.version)).toEqual(['2026-11'])
  })
})
