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
 * own confirmation flow (`changeEmailFormSchema`, MV-052).
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
 * Input of the `requestEmailChange` Server Action (`/tili` "Vaihda", E04 MV-052): the new
 * address, lower-cased like registration's. Whether it differs from the current one is
 * checked on the server, which knows the account.
 */
export const changeEmailFormSchema = z.object({
  // Trimmed before the format check: a pasted address often brings a trailing space.
  email: z.string().trim().toLowerCase().pipe(z.email(profileCopy.emailInvalid)),
})

export type ChangeEmailFormValues = z.infer<typeof changeEmailFormSchema>

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

export const NOTIFICATION_MODES = ['immediate', 'daily', 'weekly'] as const
export type NotificationMode = (typeof NOTIFICATION_MODES)[number]

/**
 * Input of the `updateNotificationPrefs` Server Action (`/tili/ilmoitukset`, E04 MV-054): the
 * global switch and the delivery mode. Each control saves on its own, so both are optional;
 * an empty object changes nothing.
 */
export const notificationPrefsSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(NOTIFICATION_MODES).optional(),
})

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>

/** Input of `setWatchAreaNotifications`: one watch area's own on/off switch. */
export const watchAreaNotificationsSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
})

/** Input of `setMarketingConsent`: the "Palvelun uutiset" switch. */
export const marketingConsentSchema = z.object({ granted: z.boolean() })
