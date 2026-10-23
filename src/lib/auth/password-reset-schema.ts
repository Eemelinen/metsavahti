import { z } from 'zod'

import { fi } from '@/i18n/fi'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-strength'

const copy = fi.auth.resetPassword.errors

/** A reset link is valid for one hour (`Users.auth.forgotPassword.expiration`, the promise in the email). */
export const RESET_LINK_TTL_MS = 60 * 60 * 1000

/** Where `/uusi-salasana` lands after a successful reset: the login with its success banner. */
export const AFTER_RESET_PATH = '/kirjaudu?reset=1'

/**
 * Input of the `requestPasswordReset` Server Action (E03 MV-045). Browser-safe like
 * `login-schema.ts`: the address is normalised the way registration stored it.
 */
export const forgotPasswordSchema = z.object({
  email: z.email(fi.auth.forgotPassword.errors.emailInvalid).trim().toLowerCase(),
})

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

/**
 * Input of the `resetPassword` Server Action: the token from the link plus the new password
 * twice. The length and the match are checked here (in the browser and again on the
 * server); the zxcvbn requirement needs the account's address, so `resetUserPassword()`
 * adds it once the token has named the account.
 */
export const resetPasswordFormSchema = z
  .object({
    token: z.string().min(1, copy.tokenMissing),
    password: z.string().min(MIN_PASSWORD_LENGTH, copy.passwordTooShort),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: copy.passwordMismatch,
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>
export type ResetPasswordField = keyof ResetPasswordFormValues
export type ResetPasswordFieldErrors = Partial<Record<ResetPasswordField, string>>
