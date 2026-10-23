import type { Payload } from 'payload'

import { fi } from '@/i18n/fi'
import { scorePassword } from '@/lib/auth/password-strength'
import {
  type RegistrationField,
  type RegistrationFieldErrors,
  type RegistrationFormValues,
  passwordUserInputs,
  registrationFormSchema,
} from '@/lib/auth/registration-schema'
import type { ActionError } from '@/lib/errors'
import { findLatestLegalDocument } from '@/lib/legal/documents'
import type { User } from '@/payload-types'

export type RegistrationValidation =
  | { success: true; data: RegistrationFormValues }
  | { success: false; fieldErrors: RegistrationFieldErrors }

/**
 * The full server-side check: the form schema plus the zxcvbn requirement (score ≥ 3 with
 * the email and its local part as penalised inputs). Errors are keyed by field so the form can show them
 * inline; only the first message per field is kept.
 */
export function validateRegistration(input: unknown): RegistrationValidation {
  const parsed = registrationFormSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: RegistrationFieldErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as RegistrationField | undefined
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
    }
    return { success: false, fieldErrors }
  }
  const { password, email } = parsed.data
  if (!scorePassword(password, passwordUserInputs(email)).acceptable) {
    return { success: false, fieldErrors: { password: fi.auth.register.errors.passwordTooWeak } }
  }
  return { success: true, data: parsed.data }
}

export type RegistrationContext = {
  /** Client address; stored on the consent rows reduced to its network prefix. */
  ip: string | null
  userAgent: string | null
}

export type RegistrationOutcome =
  | { status: 'created'; user: User }
  /** The address already has an account. Nothing was written or sent; the caller must not reveal this. */
  | { status: 'duplicate' }

/**
 * Create the account and its consent trail (`01 §3.7`, `01 §8`): a `terms` and a `privacy`
 * event at the current published version of each document, plus a `marketing` event when
 * the box was ticked (recorded at the privacy-policy version, which is where marketing
 * messages are described). Payload sends the verification email (`Users.auth.verify`,
 * `src/emails/VerifyEmail.tsx`) as part of `create`. The legal documents must be published
 * (`pnpm db:seed`, or the test setups); registering without them is a server error, never a
 * silent consent row with an empty version.
 */
export async function registerUser(
  payload: Payload,
  data: RegistrationFormValues,
  context: RegistrationContext,
): Promise<RegistrationOutcome> {
  const existing = await payload.count({
    collection: 'users',
    where: { email: { equals: data.email } },
    overrideAccess: true,
  })
  if (existing.totalDocs > 0) return { status: 'duplicate' }

  const [terms, privacy] = await Promise.all([
    findLatestLegalDocument(payload, 'terms'),
    findLatestLegalDocument(payload, 'privacy'),
  ])
  if (!terms || !privacy) {
    throw new Error('Legal documents are not published; run pnpm db:seed before registration')
  }

  const user = await payload.create({
    collection: 'users',
    // `role` is required by the type; the collection hook decides the real value.
    data: {
      email: data.email,
      password: data.password,
      marketingConsent: data.marketing,
      role: 'user',
    },
    overrideAccess: true,
  })

  const consents: Array<{ kind: 'terms' | 'privacy' | 'marketing'; version: string }> = [
    { kind: 'terms', version: terms.version },
    { kind: 'privacy', version: privacy.version },
  ]
  if (data.marketing) consents.push({ kind: 'marketing', version: privacy.version })
  for (const consent of consents) {
    await payload.create({
      collection: 'consent-events',
      data: {
        user: user.id,
        kind: consent.kind,
        version: consent.version,
        granted: true,
        ip: context.ip,
        userAgent: context.userAgent,
      },
      overrideAccess: true,
    })
  }

  return { status: 'created', user }
}

/** What the `register` Server Action returns when it does not redirect. */
export type RegisterActionResult =
  | { ok: false; fieldErrors: RegistrationFieldErrors; error?: undefined }
  | { ok: false; error: ActionError; fieldErrors?: undefined }

/** Where the action sends the browser after a submission (`03-pages.md`: `/vahvista-sahkoposti?email=`). */
export function verifyEmailPath(email: string): string {
  return `/vahvista-sahkoposti?email=${encodeURIComponent(email)}`
}
