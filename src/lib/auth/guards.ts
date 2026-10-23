import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'

import config from '@payload-config'
import { DEFAULT_AFTER_LOGIN } from '@/lib/auth/login-schema'
import { pageDecision } from '@/lib/auth/page-access'
import { type SessionState, resolveSession } from '@/lib/auth/session'
import { Unauthorized } from '@/lib/errors'
import type { User } from '@/payload-types'

/**
 * Session helpers for pages, Server Actions and Route Handlers (E03 MV-046, absorbed MV-047).
 * `src/proxy.ts` only makes the cookie-signature check; these make the real one against the
 * database, so every `(app)` page and every action that touches user data calls one of them.
 */

/** The request's session, resolved once per render (React `cache`). */
const currentSession = cache(async (): Promise<SessionState> => {
  const payload = await getPayload({ config })
  return resolveSession(payload, await headers())
})

/** The verified user behind the request, or `null` (guest, unverified, revoked, forged). */
export async function getSessionUser(): Promise<User | null> {
  const session = await currentSession()
  return session.status === 'user' ? session.user : null
}

/**
 * The verified user, or no way past this line.
 *
 * - In a page, pass `{ next }` (the page's own path): a guest is redirected to
 *   `/kirjaudu?next=`, an unverified account to `/vahvista-sahkoposti?…&required=1`.
 * - In a Server Action or Route Handler, call it bare: it throws `Unauthorized`, which
 *   `actionResult()` / `toErrorResponse()` turn into `{ ok: false, error: { code: 'unauthorized' } }`.
 */
export async function requireUser(options?: { next: string }): Promise<User> {
  const session = await currentSession()
  if (session.status === 'user') return session.user
  if (!options) throw new Unauthorized()
  const decision = pageDecision('user', session, options.next)
  if (decision.type === 'redirect') redirect(decision.to)
  throw new Unauthorized()
}

/**
 * Guest-only pages (`/kirjaudu`, `/rekisteroidy`, `/unohtunut-salasana`): a signed-in user is
 * sent to `next` when it is a safe same-origin path, otherwise to the app home.
 */
export async function redirectSignedInUser(next: string = DEFAULT_AFTER_LOGIN): Promise<void> {
  const decision = pageDecision('guest-only', await currentSession(), next)
  if (decision.type === 'redirect') redirect(decision.to)
}
