import { z } from 'zod'

import { fi } from '@/i18n/fi'

/** How long the "Lähetä uudelleen" button stays disabled after a resend (App artboard `vahvista`). */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Input of the `resendVerification` Server Action (E03 MV-043). Browser-safe like
 * `registration-schema.ts`: the address is normalised the same way registration stores it.
 */
export const resendVerificationSchema = z.object({
  email: z.email(fi.auth.register.errors.emailInvalid).trim().toLowerCase(),
})
