import type { Payload } from 'payload'

import { resolveSession } from '@/lib/auth/session'
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE_SECONDS,
  type CookieConsent,
  consentRequestSchema,
  createConsent,
  serializeConsent,
} from '@/lib/consent/consent-cookie'
import { env } from '@/lib/env'
import { toErrorResponse } from '@/lib/errors'
import { findLatestLegalDocument } from '@/lib/legal/documents'
import { clientIp } from '@/lib/privacy/ip'

/**
 * `Set-Cookie` value of the choice: 12 months, whole site, `SameSite=Lax`, `HttpOnly` (the
 * frontend layout reads it on the server and hands it to the banner), `Secure` over https.
 */
export function consentSetCookie(
  consent: CookieConsent,
  { secure = env.NEXT_PUBLIC_SERVER_URL.startsWith('https:') }: { secure?: boolean } = {},
): string {
  const parts = [
    `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(consent))}`,
    'Path=/',
    `Max-Age=${CONSENT_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    'HttpOnly',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/**
 * `POST /api/consent` (`01 §6`, `01 §8`, MV-090), open to anyone: validates `{ analytics }`,
 * answers `{ ok: true, consent }` with the `mv_consent` cookie, and for a signed-in account
 * (verified or not) appends a `cookies` consent event: `granted` is the analytics choice (the
 * necessary category cannot be refused), `version` the published cookie policy. Every save
 * is a decision the visitor clicked, so each one is recorded.
 *
 * Only `application/json` is accepted: a cross-site page cannot send that without a CORS
 * preflight, so a forged form post can neither set the cookie nor write an event.
 */
export async function consentResponse(
  payload: Payload,
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return Response.json({ ok: false, error: 'unsupported_media_type' }, { status: 415 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }
  const parsed = consentRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const consent = createConsent(parsed.data.analytics, now)
  try {
    const session = await resolveSession(payload, request.headers, now.getTime())
    if (session.status !== 'guest') {
      const policy = await findLatestLegalDocument(payload, 'cookies', now)
      if (!policy) {
        throw new Error('The cookie policy is not published; run pnpm db:seed first')
      }
      await payload.create({
        collection: 'consent-events',
        data: {
          user: session.user.id,
          kind: 'cookies',
          version: policy.version,
          granted: consent.analytics,
          ip: clientIp(request.headers),
          userAgent: request.headers.get('user-agent'),
        },
        overrideAccess: true,
      })
    }
  } catch (error) {
    return toErrorResponse(error)
  }

  return Response.json(
    { ok: true, consent },
    { headers: { 'Set-Cookie': consentSetCookie(consent), 'Cache-Control': 'no-store' } },
  )
}
