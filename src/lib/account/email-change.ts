import { randomUUID } from 'node:crypto'

import type { Payload } from 'payload'

import { CHANGE_EMAIL_SUBJECT, renderChangeEmailConfirm } from '@/emails/ChangeEmailConfirm'
import { EMAIL_CHANGE_NOTICE_SUBJECT, renderEmailChangeNotice } from '@/emails/EmailChangeNotice'
import { env } from '@/lib/env'
import { createRateLimiter } from '@/lib/rate-limit'
import { signToken, verifyToken } from '@/lib/tokens'
import type { User } from '@/payload-types'

/** The confirmation link is valid for one hour (ticket MV-052). */
export const EMAIL_CHANGE_TTL_SECONDS = 60 * 60

/**
 * Change requests per account: three per hour. Each one sends two emails (the new and the old
 * address), so a hijacked session cannot use the form to flood mailboxes.
 */
export const emailChangeLimiter = createRateLimiter({
  name: 'email-change',
  limit: 3,
  windowMs: 60 * 60 * 1000,
})

export type EmailChangeRequestOutcome =
  /** `pendingEmail` is set and the notices went out (see `requestEmailChange`). */
  | { status: 'requested'; pendingEmail: string }
  /** The address is already the account's own; nothing was written or sent. */
  | { status: 'same' }
  /** Over `emailChangeLimiter`. */
  | { status: 'limited'; retryAfterSeconds: number }

async function isAddressTaken(payload: Payload, email: string, exceptId: number) {
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: { and: [{ email: { equals: email } }, { id: { not_equals: exceptId } }] },
    overrideAccess: true,
  })
  return totalDocs > 0
}

/**
 * `/tili` "Vaihda" (E04 MV-052, `01 §7`): store `newEmail` as the account's `pendingEmail`
 * together with the `jti` of a fresh signed link (`jose`, purpose `email-change`, one hour),
 * send `ChangeEmailConfirm` with that link to the new address and `EmailChangeNotice` to the
 * current one. The login address does not change until the link is opened
 * (`applyEmailChange`). A newer request replaces the pending address and invalidates every
 * earlier link, because only the stored `jti` is accepted.
 *
 * An address that already has an account gets no link (it could never be applied), but the
 * outcome, the stored `pendingEmail` and the notice to the current address are the same as
 * for a free one, so the form cannot be used to find out who is registered (as registration,
 * D-024).
 */
export async function requestEmailChange(
  payload: Payload,
  user: Pick<User, 'id' | 'email'>,
  newEmail: string,
): Promise<EmailChangeRequestOutcome> {
  if (newEmail === user.email) return { status: 'same' }
  const limit = await emailChangeLimiter.check(String(user.id))
  if (!limit.allowed) return { status: 'limited', retryAfterSeconds: limit.retryAfterSeconds }

  const jti = randomUUID()
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { pendingEmail: newEmail, pendingEmailTokenId: jti },
    depth: 0,
    overrideAccess: true,
  })

  const baseUrl = env.NEXT_PUBLIC_SERVER_URL
  if (!(await isAddressTaken(payload, newEmail, user.id))) {
    const token = await signToken(
      'email-change',
      { sub: String(user.id), jti, email: newEmail },
      EMAIL_CHANGE_TTL_SECONDS,
    )
    const confirm = await renderChangeEmailConfirm({ newEmail, token, baseUrl })
    await payload.sendEmail({ to: newEmail, subject: CHANGE_EMAIL_SUBJECT, ...confirm })
  }
  const notice = await renderEmailChangeNotice({ newEmail, baseUrl })
  await payload.sendEmail({ to: user.email, subject: EMAIL_CHANGE_NOTICE_SUBJECT, ...notice })
  return { status: 'requested', pendingEmail: newEmail }
}

export type EmailChangeOutcome =
  /** `email` is now the account's (verified) login address. */
  | { state: 'changed'; email: string }
  /** Bad signature, expired, already used, replaced by a newer request, or unknown account. */
  | { state: 'invalid' }
  /** Another account took the address after the link was sent; nothing changed. */
  | { state: 'taken' }

/**
 * `/vaihda-sahkoposti/vahvista?token=` (E04 MV-052): apply the pending change behind a valid
 * link. The token must verify (signature, purpose, expiry) and its `jti` and address must match
 * what the account still has pending; the change then moves `pendingEmail` to `email`, marks
 * the account verified (the link proved the mailbox) and clears the pending fields, so the
 * same link is rejected the second time. A password-reset link sent to the old address stops
 * working with it. Sessions are kept: the person who just proved both the session and the new
 * mailbox stays signed in.
 */
export async function applyEmailChange(
  payload: Payload,
  token: string | undefined,
  now: Date = new Date(),
): Promise<EmailChangeOutcome> {
  if (!token) return { state: 'invalid' }
  const claims = await verifyToken('email-change', token, now)
  const id = Number(claims?.sub)
  if (!claims || typeof claims.email !== 'string' || !Number.isInteger(id)) {
    return { state: 'invalid' }
  }
  const user = await payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
    disableErrors: true,
  })
  if (
    !user ||
    !user.pendingEmailTokenId ||
    user.pendingEmailTokenId !== claims.jti ||
    user.pendingEmail !== claims.email
  ) {
    return { state: 'invalid' }
  }
  if (await isAddressTaken(payload, claims.email, user.id)) {
    await clearPendingEmail(payload, user.id)
    return { state: 'taken' }
  }
  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      email: claims.email,
      _verified: true,
      _verificationToken: null,
      pendingEmail: null,
      pendingEmailTokenId: null,
      resetPasswordToken: null,
      resetPasswordExpiration: null,
    },
    depth: 0,
    overrideAccess: true,
  })
  return { state: 'changed', email: claims.email }
}

async function clearPendingEmail(payload: Payload, id: number) {
  await payload.update({
    collection: 'users',
    id,
    data: { pendingEmail: null, pendingEmailTokenId: null },
    depth: 0,
    overrideAccess: true,
  })
}
