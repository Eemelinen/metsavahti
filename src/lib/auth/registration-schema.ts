import { z } from 'zod'

import { fi } from '@/i18n/fi'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-strength'

const copy = fi.auth.register.errors

/**
 * Registration form fields (E03 MV-042). This module is imported by the browser bundle, so
 * it must stay free of zxcvbn: the strength requirement is added on the server by
 * `validateRegistration()` in `registration.ts`, and the meter in `PasswordInput` loads
 * the scorer lazily.
 */
export const registrationFormSchema = z
  .object({
    email: z.email(copy.emailInvalid).trim().toLowerCase(),
    password: z.string().min(MIN_PASSWORD_LENGTH, copy.passwordTooShort),
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((value) => value, copy.termsRequired),
    marketing: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: copy.passwordMismatch,
  })

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>
export type RegistrationField = keyof RegistrationFormValues
export type RegistrationFieldErrors = Partial<Record<RegistrationField, string>>

/**
 * Words zxcvbn should treat as guessable for this registrant: the address and its local
 * part (zxcvbn matches user inputs as whole tokens, so the address alone would not catch
 * `anna.k` inside a password). Shared by the meter and `validateRegistration()`.
 */
export function passwordUserInputs(email: string): string[] {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return []
  const local = trimmed.split('@')[0] ?? ''
  return local && local !== trimmed ? [trimmed, local] : [trimmed]
}
