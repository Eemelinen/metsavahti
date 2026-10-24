import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CONSENT_COOKIE, parseConsentCookie } from '@/lib/consent/consent-cookie'
import { env } from '@/lib/env'
import { PLACEHOLDER_VERSION, seedLegalDocuments } from '@/lib/legal/documents'
import type { User } from '@/payload-types'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

/**
 * MV-090: `POST /api/consent` sets `mv_consent` for anyone and appends a `cookies` consent
 * event at the published cookie-policy version when the request carries a session.
 */
describe('cookie consent (MV-090)', () => {
  let payload: Payload
  let user: User & { password: string }

  async function post(body: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import('@/app/api/consent/route')
    return POST(
      new Request('http://localhost/api/consent', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: env.NEXT_PUBLIC_SERVER_URL,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    )
  }

  async function sessionCookie() {
    const { token } = await payload.login({
      collection: 'users',
      data: { email: user.email, password: user.password },
    })
    return `payload-token=${token}`
  }

  /** The `mv_consent` value a response sets, decoded. */
  function storedConsent(res: Response) {
    const header = res.headers.get('set-cookie') ?? ''
    const match = new RegExp(`^${CONSENT_COOKIE}=([^;]*)`).exec(header)
    return parseConsentCookie(match?.[1])
  }

  async function eventsOf(id: number) {
    const { docs } = await payload.find({
      collection: 'consent-events',
      where: { user: { equals: id } },
      sort: 'createdAt',
      overrideAccess: true,
    })
    return docs
  }

  async function eventCount() {
    return (await payload.count({ collection: 'consent-events', overrideAccess: true })).totalDocs
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    await seedLegalDocuments(payload)
    user = await createTestUser(payload)
  })

  // The last test deletes the cookie policy; put it back so no test depends on running first.
  afterAll(async () => {
    await seedLegalDocuments(payload)
  })

  it('sets the 12-month cookie for a guest and records nothing', async () => {
    const before = await eventCount()
    const res = await post({ analytics: false })
    expect(res.status).toBe(200)
    const header = res.headers.get('set-cookie') ?? ''
    expect(header).toMatch(/; Path=\/; Max-Age=31536000; SameSite=Lax; HttpOnly$/)
    expect(storedConsent(res)).toMatchObject({ necessary: true, analytics: false })
    expect(await res.json()).toMatchObject({ ok: true, consent: { analytics: false } })
    expect(await eventCount()).toBe(before)
  })

  it('records a cookies event per choice for a signed-in user', async () => {
    const cookie = await sessionCookie()
    const granted = await post(
      { analytics: true },
      { cookie, 'x-forwarded-for': '203.0.113.77', 'user-agent': 'Vitest consent' },
    )
    expect(granted.status).toBe(200)
    expect(storedConsent(granted)).toMatchObject({ analytics: true })

    const withdrawn = await post({ analytics: false }, { cookie })
    expect(withdrawn.status).toBe(200)
    expect(storedConsent(withdrawn)).toMatchObject({ analytics: false })

    const events = await eventsOf(user.id)
    expect(
      events.map(({ kind, version, granted, ip, userAgent }) => ({
        kind,
        version,
        granted,
        ip,
        userAgent,
      })),
    ).toEqual([
      {
        kind: 'cookies',
        version: PLACEHOLDER_VERSION,
        granted: true,
        ip: '203.0.113.0',
        userAgent: 'Vitest consent',
      },
      { kind: 'cookies', version: PLACEHOLDER_VERSION, granted: false, ip: null, userAgent: null },
    ])
  })

  it('treats a forged session cookie as a guest', async () => {
    const before = await eventCount()
    const res = await post({ analytics: true }, { cookie: 'payload-token=not-a-token' })
    expect(res.status).toBe(200)
    expect(storedConsent(res)).toMatchObject({ analytics: true })
    expect(await eventCount()).toBe(before)
  })

  it('rejects an invalid body without a cookie or an event', async () => {
    const before = await eventCount()
    const res = await post({ analytics: 'kyllä' }, { cookie: await sessionCookie() })
    expect(res.status).toBe(400)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(await eventCount()).toBe(before)
  })

  it('answers 500 without a cookie when the cookie policy is not published', async () => {
    await payload.delete({
      collection: 'legal-documents',
      where: { slug: { equals: 'cookies' } },
      overrideAccess: true,
    })
    const res = await post({ analytics: true }, { cookie: await sessionCookie() })
    expect(res.status).toBe(500)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
