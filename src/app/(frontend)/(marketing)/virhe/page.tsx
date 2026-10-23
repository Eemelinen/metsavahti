import { notFound } from 'next/navigation'

import { env } from '@/lib/env'

/**
 * Throwing route that exercises the root error boundary (`../../error.tsx`) end to end.
 * Only enabled with `ENABLE_ERROR_TEST_ROUTE=1` (`.env.test`); everywhere else it is a 404.
 * Rendered per request so a production build never tries to prerender the throw.
 */
export const dynamic = 'force-dynamic'

export default function ErrorTestPage() {
  if (env.ENABLE_ERROR_TEST_ROUTE !== '1') notFound()
  throw new Error('Testivirhe: /virhe kaataa sivun tarkoituksella (ENABLE_ERROR_TEST_ROUTE=1).')
}
