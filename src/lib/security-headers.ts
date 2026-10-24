/**
 * Response security headers set by `src/proxy.ts` (E03 MV-046, `01 §9`: "CSP with nonce; map
 * tiles/WMS domains allow-listed. HSTS"). Pure functions so the unit suite can pin the policy.
 *
 * The frontend gets a strict, nonce-based CSP: Next.js reads the nonce from the request's
 * `Content-Security-Policy` header and puts it on its own scripts, which only works for
 * dynamically rendered pages (the frontend root layout opts every page in). Styles allow
 * `'unsafe-inline'` because MapLibre and Radix set `style` attributes; a nonce in `style-src`
 * would switch that off. The Payload admin (`/admin`) only gets `frame-ancestors 'none'`: its
 * editor fields load code from a CDN, and its policy belongs to the security review pass (MV-130).
 */

export interface CspOptions {
  nonce: string
  /** `next dev`: React needs `eval` for its debugging stacks. Never in production. */
  dev: boolean
  /** Add `upgrade-insecure-requests` (the site is served over https). */
  https: boolean
  /** Client Sentry DSN; its origin is allowed in `connect-src`. */
  sentryDsn?: string
  /** Base-map and WMS tile origins (`mapSourceOrigins()`); MapLibre fetches tiles, so both lists. */
  mapOrigins?: readonly string[]
}

/** A fresh, unguessable nonce for one request (128 random bits, base64). */
export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

function originOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** The frontend's `Content-Security-Policy` value. */
export function contentSecurityPolicy({
  nonce,
  dev,
  https,
  sentryDsn,
  mapOrigins = [],
}: CspOptions): string {
  const sentry = originOf(sentryDsn)
  const directives: Array<[string, ...string[]]> = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'blob:', 'data:', ...mapOrigins],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...mapOrigins, ...(sentry ? [sentry] : [])],
    ['worker-src', "'self'", 'blob:'],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]
  if (https) directives.push(['upgrade-insecure-requests'])
  return directives.map((d) => d.join(' ')).join('; ')
}

/** The admin's policy: only forbid framing (see the module comment). */
export const ADMIN_CONTENT_SECURITY_POLICY = "frame-ancestors 'none'"

/** Headers every response from the proxy carries, whatever the route. */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // Two years; browsers ignore the header on plain-http responses (local dev and tests).
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=()',
}
