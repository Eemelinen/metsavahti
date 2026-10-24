import { z } from 'zod'

/**
 * The `mv_consent` cookie (`01 §8`, MV-090): the visitor's cookie choice, readable on the
 * server and in the browser bundle (no Payload or env imports). Categories are `necessary`
 * (always on: session, CSRF, this cookie) and `analytics`; v1 has no marketing category.
 */
export const CONSENT_COOKIE = 'mv_consent'

/** 12 months (`01 §8`), in seconds for `Max-Age`. */
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

export type CookieConsent = {
  necessary: true
  analytics: boolean
  /** When the choice was made (ISO 8601). */
  at: string
}

const cookieConsentSchema = z.object({
  necessary: z.literal(true),
  analytics: z.boolean(),
  at: z.iso.datetime(),
})

/** Body of `POST /api/consent`: only the optional category is a choice. */
export const consentRequestSchema = z.strictObject({ analytics: z.boolean() })

export function createConsent(analytics: boolean, now: Date = new Date()): CookieConsent {
  return { necessary: true, analytics, at: now.toISOString() }
}

export function serializeConsent(consent: CookieConsent): string {
  return JSON.stringify(consent)
}

/**
 * The stored choice, or `null` when there is none or it cannot be read (garbage, an older
 * shape): the banner then asks again, which is the safe default. Accepts the value both as
 * sent (URL-encoded by `ResponseCookies`) and decoded.
 */
export function parseConsentCookie(value: string | null | undefined): CookieConsent | null {
  if (!value) return null
  for (const candidate of [value, safeDecode(value)]) {
    if (candidate === null) continue
    try {
      const parsed = cookieConsentSchema.safeParse(JSON.parse(candidate))
      if (parsed.success) return parsed.data
    } catch {
      // Not JSON; try the next form.
    }
  }
  return null
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}
