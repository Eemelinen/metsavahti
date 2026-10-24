import { z } from 'zod'

import { fi } from '@/i18n/fi'
import type { ActionError } from '@/lib/errors'

const copy = fi.publicForms.errors

export const MAX_CONTACT_NAME_LENGTH = 100
export const MIN_MESSAGE_LENGTH = 3
export const MAX_MESSAGE_LENGTH = 5000

/** Request types of `/tietopyynto` (`03-pages.md`: access / erasure / other; artboard: tarkastus / poisto / muu). */
export const DATA_REQUEST_TYPES = ['access', 'erasure', 'other'] as const
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number]

/**
 * Name of the honeypot input both forms render out of sight (MV-095, ledger S9). People never
 * see or reach it; a bot that fills every field does, and the action then answers as if the
 * message went out without sending anything.
 */
export const HONEYPOT_FIELD = 'website'

const email = z.string().trim().toLowerCase().pipe(z.email(copy.emailInvalid))
const message = z
  .string()
  .trim()
  .min(MIN_MESSAGE_LENGTH, copy.messageMissing)
  .max(MAX_MESSAGE_LENGTH, copy.messageTooLong)
const consent = z.boolean().refine((value) => value, copy.consentRequired)
// Never refused: a filled honeypot is answered with the normal success (`isSpam()`).
const honeypot = z.string().optional()

/**
 * Input of `submitContact` (`/yhteystiedot`, MV-095). Browser-safe: the form validates with it
 * before the round trip and the action again. The name is optional (artboard: no asterisk);
 * the form sends `''`, a post without the field is fine too.
 */
export const contactFormSchema = z.object({
  name: z.string().trim().max(MAX_CONTACT_NAME_LENGTH, copy.nameTooLong).optional(),
  email,
  message,
  consent,
  [HONEYPOT_FIELD]: honeypot,
})

export type ContactFormValues = z.infer<typeof contactFormSchema>
export type ContactField = Exclude<keyof ContactFormValues, typeof HONEYPOT_FIELD>

/** Input of `submitDataRequest` (`/tietopyynto`, MV-095). */
export const dataRequestFormSchema = z.object({
  email,
  type: z.enum(DATA_REQUEST_TYPES, copy.typeRequired),
  message,
  consent,
  [HONEYPOT_FIELD]: honeypot,
})

export type DataRequestFormValues = z.infer<typeof dataRequestFormSchema>
export type DataRequestField = Exclude<keyof DataRequestFormValues, typeof HONEYPOT_FIELD>

/** `true` when the hidden field carries anything: the post came from a bot. */
export function isSpam(values: { [HONEYPOT_FIELD]?: string }): boolean {
  return Boolean(values[HONEYPOT_FIELD]?.trim())
}

/** What `submitContact` / `submitDataRequest` answer: success, per-field errors or a form-level error. */
export type PublicFormActionResult<Field extends string> =
  | { ok: true; data: { sent: true } }
  | { ok: false; fieldErrors: Partial<Record<Field, string>>; error?: undefined }
  | { ok: false; error: ActionError; fieldErrors?: undefined }
