import type { NextRequest } from 'next/server'

import { handleRequest } from '@/lib/auth/route-protection'
import { payloadSecretKey } from '@/lib/auth/session'
import { env } from '@/lib/env'

/**
 * Next 16's middleware (ledger R6): maintenance mode, the login redirect for `(app)` routes
 * and the security headers. The logic lives in `lib/auth/route-protection.ts`.
 */
const options = {
  maintenance: env.MAINTENANCE_MODE === '1',
  secretKey: payloadSecretKey(env.PAYLOAD_SECRET),
  dev: env.NODE_ENV === 'development',
  https: env.NEXT_PUBLIC_SERVER_URL.startsWith('https:'),
  sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
}

export function proxy(request: NextRequest) {
  return handleRequest(request, options)
}

export const config = {
  matcher: [
    // Everything except build assets and the favicon; prefetches skip the proxy (the page
    // they prefetch still checks the session when it renders).
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
