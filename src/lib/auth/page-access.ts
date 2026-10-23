import { loginPath, safeNextPath } from '@/lib/auth/login-schema'
import type { SessionState } from '@/lib/auth/session'
import { verificationRequiredPath } from '@/lib/auth/verification'
import { Forbidden } from '@/lib/errors'
import type { User } from '@/payload-types'

/**
 * The pure halves of the session helpers in `guards.ts` (E03 MV-046): what a page does for a
 * session, and the ownership check of Server Actions. No request context, so the unit and
 * integration suites call them directly.
 */

export type PageDecision = { type: 'allow' } | { type: 'redirect'; to: string }

/**
 * What a page with the given Auth column does for a session (`03-pages.md`): a `user` page
 * sends an unverified account to the `vahvistus_vaaditaan` interstitial and a guest to
 * `/kirjaudu?next=<path>`; a `guest-only` page sends a signed-in user on to `next` (or the
 * app home). Pure, so the integration matrix can run it against real sessions.
 */
export function pageDecision(
  access: 'user' | 'guest-only',
  session: SessionState,
  path: string,
): PageDecision {
  if (access === 'user') {
    if (session.status === 'user') return { type: 'allow' }
    if (session.status === 'unverified') {
      return { type: 'redirect', to: verificationRequiredPath(session.user.email) }
    }
    return { type: 'redirect', to: loginPath(path) }
  }
  if (session.status === 'user') return { type: 'redirect', to: safeNextPath(path) }
  return { type: 'allow' }
}

type OwnerRef = number | { id: number } | null | undefined

/** A document with an owner: `owner` on `watch-areas`, `user` on the other user-owned collections. */
export type OwnedDoc = { owner: OwnerRef } | { user: OwnerRef }

function ownerId(doc: OwnedDoc): number | null {
  const ref = 'owner' in doc ? doc.owner : doc.user
  if (ref === null || ref === undefined) return null
  return typeof ref === 'number' ? ref : ref.id
}

/**
 * Server Actions check ownership again (`01 §9`: never trust ids). Throws `Forbidden` unless
 * `user` owns `doc`; an admin is no exception here, the app pages are personal.
 */
export function assertOwner(user: Pick<User, 'id'>, doc: OwnedDoc): void {
  if (ownerId(doc) !== user.id) throw new Forbidden()
}
