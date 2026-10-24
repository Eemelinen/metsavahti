import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  consentRequestSchema,
  createConsent,
  parseConsentCookie,
  serializeConsent,
} from '@/lib/consent/consent-cookie'
import { consentResponse, consentSetCookie } from '@/lib/consent/record-consent'

const NOW = new Date('2026-10-24T08:00:00.000Z')

/** Enough of Payload for a guest request: no session cookie, so nothing is looked up or written. */
function guestPayload() {
  return {
    auth: vi.fn(async () => ({ user: null })),
    config: { cookiePrefix: 'payload' },
    create: vi.fn(),
  }
}

function post(body: string, contentType = 'application/json') {
  return new Request('http://localhost/api/consent', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
}

/** MV-090: the `mv_consent` cookie and the guest side of `POST /api/consent`. */
describe('mv_consent cookie', () => {
  it('keeps the necessary category on and dates the choice', () => {
    expect(createConsent(true, NOW)).toEqual({
      necessary: true,
      analytics: true,
      at: '2026-10-24T08:00:00.000Z',
    })
  })

  it('reads back what it writes, raw or URL-encoded', () => {
    const consent = createConsent(false, NOW)
    expect(parseConsentCookie(serializeConsent(consent))).toEqual(consent)
    expect(parseConsentCookie(encodeURIComponent(serializeConsent(consent)))).toEqual(consent)
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not JSON', 'yes'],
    ['broken encoding', '%E0%A4%A'],
    ['necessary refused', JSON.stringify({ necessary: false, analytics: false, at: NOW })],
    ['analytics not a boolean', JSON.stringify({ necessary: true, analytics: 'yes', at: NOW })],
    ['no date', JSON.stringify({ necessary: true, analytics: true })],
  ])('treats a %s value as no choice, so the banner asks again', (_label, value) => {
    expect(parseConsentCookie(value)).toBeNull()
  })

  it('accepts only the analytics choice in the request body', () => {
    expect(consentRequestSchema.safeParse({ analytics: true }).success).toBe(true)
    expect(consentRequestSchema.safeParse({}).success).toBe(false)
    expect(consentRequestSchema.safeParse({ analytics: 'true' }).success).toBe(false)
    expect(consentRequestSchema.safeParse({ analytics: true, marketing: true }).success).toBe(false)
  })

  it('lasts 12 months on the whole site, Lax and HttpOnly, Secure only over https', () => {
    const consent = createConsent(true, NOW)
    const value = encodeURIComponent(serializeConsent(consent))
    expect(CONSENT_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000)
    expect(consentSetCookie(consent, { secure: false })).toBe(
      `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`,
    )
    expect(consentSetCookie(consent, { secure: true })).toMatch(/; Secure$/)
  })
})

describe('POST /api/consent (guest)', () => {
  it('sets the cookie and writes no event without a session', async () => {
    const payload = guestPayload()
    const res = await consentResponse(
      payload as unknown as Payload,
      post(JSON.stringify({ analytics: false })),
      NOW,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, consent: createConsent(false, NOW) })
    expect(res.headers.get('set-cookie')).toBe(consentSetCookie(createConsent(false, NOW)))
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('refuses anything but JSON (a cross-site form cannot post JSON)', async () => {
    const payload = guestPayload()
    const res = await consentResponse(
      payload as unknown as Payload,
      post('analytics=true', 'application/x-www-form-urlencoded'),
    )
    expect(res.status).toBe(415)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it.each([
    ['broken JSON', '{'],
    ['no choice', '{}'],
    ['a string choice', '{"analytics":"yes"}'],
  ])('answers 400 to %s without setting the cookie', async (_label, body) => {
    const res = await consentResponse(guestPayload() as unknown as Payload, post(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_request' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
