import { z } from 'zod'

import { fi } from '@/i18n/fi'
import { isValidTimeZone } from '@/lib/account/timezone'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-strength'

const profileCopy = fi.account.profile.errors
const passwordCopy = fi.account.password.errors

export const MAX_NAME_LENGTH = 100

export const LOCALES = ['fi', 'en'] as const

/**
 * Input of the `updateProfile` Server Action (`/tili`, E04 MV-051). Browser-safe: the form
 * validates with it before the round trip and the action again. An empty name clears it
 * (`users.name` is optional); the address is not part of the profile, it changes through its
 * own confirmation flow (MV-052).
 */
export const profileFormSchema = z.object({
  name: z.string().trim().max(MAX_NAME_LENGTH, profileCopy.nameTooLong),
  locale: z.enum(LOCALES, profileCopy.localeInvalid),
  timezone: z.string().refine(isValidTimeZone, profileCopy.timezoneInvalid),
})

export type ProfileFormValues = z.infer<typeof profileFormSchema>
export type ProfileField = keyof ProfileFormValues
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>

/**
 * Input of the `changePassword` Server Action (`/tili/turvallisuus`): the current password
 * and the new one (App artboard `turvallisuus`: two fields, no repeat). The length and the
 * difference are checked here; the current password and the zxcvbn rule need the account,
 * so `changeUserPassword()` checks them on the server.
 */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, passwordCopy.currentMissing),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, passwordCopy.passwordTooShort),
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: passwordCopy.sameAsCurrent,
  })

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>
export type ChangePasswordField = keyof ChangePasswordFormValues
export type ChangePasswordFieldErrors = Partial<Record<ChangePasswordField, string>>

/** Field errors of a failed parse, the first message per field (the forms show one each). */
export function fieldErrorsOf<Field extends string>(
  error: z.ZodError,
): Partial<Record<Field, string>> {
  const fieldErrors: Partial<Record<Field, string>> = {}
  for (const issue of error.issues) {
    const field = issue.path[0] as Field | undefined
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
  }
  return fieldErrors
}
