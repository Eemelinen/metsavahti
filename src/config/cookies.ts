import { fi } from '@/i18n/fi'
import { SESSION_TTL_SECONDS } from '@/lib/auth/login-schema'
import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE_SECONDS } from '@/lib/consent/consent-cookie'

/** Consent categories of `01 §8`; v1 has no marketing category. */
export type CookieCategory = 'necessary' | 'analytics'

export type CookieInfo = {
  name: string
  /** What the cookie is for (Finnish, `/evasteet` table). */
  purpose: string
  category: CookieCategory
  /** How long the cookie lives (Finnish). */
  lifetime: string
}

const DAY_SECONDS = 24 * 60 * 60
const t = fi.legal.cookies

/**
 * Every cookie the service sets (`01 §8`, MV-091). The cookie policy page `/evasteet` renders
 * its table from this list, so a new cookie is documented by adding it here. The session
 * cookie is Payload's `<cookiePrefix>-token` with the default prefix (`lib/auth/login.ts`); the
 * service sets no CSRF cookie. The analytics provider's cookies arrive with MV-126, which picks
 * the provider.
 */
export const cookies: readonly CookieInfo[] = [
  {
    name: 'payload-token',
    purpose: t.session.purpose,
    category: 'necessary',
    lifetime: t.session.lifetime(
      SESSION_TTL_SECONDS.standard / DAY_SECONDS,
      SESSION_TTL_SECONDS.remembered / DAY_SECONDS,
    ),
  },
  {
    name: CONSENT_COOKIE,
    purpose: t.consent.purpose,
    category: 'necessary',
    lifetime: t.consent.lifetime(Math.round(CONSENT_COOKIE_MAX_AGE_SECONDS / (30 * DAY_SECONDS))),
  },
]
