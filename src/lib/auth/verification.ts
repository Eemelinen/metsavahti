import { randomBytes } from 'node:crypto'

import type { Payload } from 'payload'

import { VERIFY_EMAIL_SUBJECT, renderVerifyEmail } from '@/emails/VerifyEmail'
import { RESEND_COOLDOWN_SECONDS } from '@/lib/auth/verification-schema'
import { env } from '@/lib/env'
import { createRateLimiter } from '@/lib/rate-limit'
import type { User } from '@/payload-types'

/** A verification link is valid for 24 hours (the promise in the email and on `/vahvista-sahkoposti`). */
export const VERIFICATION_LINK_TTL_MS = 24 * 60 * 60 * 1000

/**
 * One resend per address per cooldown window, enforced on the server so a reload of the
 * page (which resets the button) cannot bypass the 60 s; the per-IP `authRateLimiter`
 * still counts every call on top of this.
 */
export const resendCooldownLimiter = createRateLimiter({
  limit: 1,
  windowMs: RESEND_COOLDOWN_SECONDS * 1000,
})

export type VerificationOutcome =
  /** The token matched a pending account, which is now verified. */
  | { state: 'verified'; email: string }
  /** The token matched a pending account but was issued more than 24 h ago; nothing changed. */
  | { state: 'expired'; email: string }
  /** No pending account carries this token: already used, malformed or never issued. */
  | { state: 'invalid' }

/**
 * Whether a link issued at `sentAt` has passed `VERIFICATION_LINK_TTL_MS`. Accounts created
 * before `verificationSentAt` existed fall back to `createdAt`, which is when Payload issued
 * their token.
 */
export function isVerificationLinkExpired(
  sentAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!sentAt) return true
  const issued = Date.parse(sentAt)
  if (Number.isNaN(issued)) return true
  return now - issued > VERIFICATION_LINK_TTL_MS
}

async function findByVerificationToken(payload: Payload, token: string): Promise<User | null> {
  const { docs } = await payload.find({
    collection: 'users',
    where: { _verificationToken: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return docs[0] ?? null
}

/**
 * `/vahvista?token=` (E03 MV-043, `03-pages.md`): resolve the token to one of three states.
 * Payload nulls `_verificationToken` when it verifies, so a used link is indistinguishable
 * from a made-up one; an expired link is refused before Payload sees it and keeps its token,
 * so the resend button on the page can replace it.
 */
export async function verifyEmailToken(
  payload: Payload,
  token: string | undefined,
  now: number = Date.now(),
): Promise<VerificationOutcome> {
  if (!token) return { state: 'invalid' }
  const user = await findByVerificationToken(payload, token)
  if (!user || user._verified) return { state: 'invalid' }
  if (isVerificationLinkExpired(user.verificationSentAt ?? user.createdAt, now)) {
    return { state: 'expired', email: user.email }
  }
  await payload.verifyEmail({ collection: 'users', token })
  return { state: 'verified', email: user.email }
}

export type ResendOutcome =
  | { status: 'sent' }
  /** No pending account for the address (unknown or already verified); nothing sent. Never revealed. */
  | { status: 'skipped' }

/**
 * Issue a fresh token (the same 20 random bytes as Payload's `create`), date it and send the
 * `VerifyEmail` template again through `payload.sendEmail`. The previous link stops working.
 */
export async function resendVerificationEmail(
  payload: Payload,
  email: string,
  now: number = Date.now(),
): Promise<ResendOutcome> {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const user = docs[0]
  if (!user || user._verified) return { status: 'skipped' }

  const token = randomBytes(20).toString('hex')
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { _verificationToken: token, verificationSentAt: new Date(now).toISOString() },
    overrideAccess: true,
  })
  const { html } = await renderVerifyEmail({ token, baseUrl: env.NEXT_PUBLIC_SERVER_URL })
  await payload.sendEmail({ to: user.email, subject: VERIFY_EMAIL_SUBJECT, html })
  return { status: 'sent' }
}

/**
 * Where an unverified session is sent (`01 §7`): the same page registration lands on, with
 * `required=1` so it explains that the watch areas open after verification (App artboard
 * `vahvistus_vaaditaan`).
 */
export function verificationRequiredPath(email: string): string {
  return `/vahvista-sahkoposti?email=${encodeURIComponent(email)}&required=1`
}
