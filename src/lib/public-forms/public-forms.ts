import { randomBytes } from 'node:crypto'

import type { Payload } from 'payload'

import { contactReceivedSubject, renderContactReceived } from '@/emails/ContactReceived'
import {
  DATA_REQUEST_CONFIRMATION_SUBJECT,
  renderDataRequestConfirmation,
} from '@/emails/DataRequestConfirmation'
import { dataRequestReceivedSubject, renderDataRequestReceived } from '@/emails/DataRequestReceived'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { formatSessionTime } from '@/lib/account/sessions'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import {
  type ContactFormValues,
  type DataRequestFormValues,
  isSpam,
} from '@/lib/public-forms/public-forms-schema'
import { createRateLimiter } from '@/lib/rate-limit'

/** Shown on the pages and used when `CONTACT_EMAIL` / `DPO_EMAIL` are unset (Yhteystiedot artboard). */
export const DEFAULT_CONTACT_EMAIL = 'tuki@metsavahti.fi'
export const DEFAULT_DPO_EMAIL = 'tietosuoja@metsavahti.fi'

/**
 * The two inboxes of the public forms. Read per call with the defaults applied here rather
 * than in the `env` schema, so a page rendered by `next build` (which skips env validation
 * and with it zod's defaults) still shows an address.
 */
export function publicFormInboxes(): { contact: string; dpo: string } {
  return {
    contact: env.CONTACT_EMAIL ?? DEFAULT_CONTACT_EMAIL,
    dpo: env.DPO_EMAIL ?? DEFAULT_DPO_EMAIL,
  }
}

/**
 * Per-IP limit of the two public forms (`01 §8`: "contact and data-request forms"), 5 posts per
 * hour like the auth actions; the actions key it `rateLimitKey('contact' | 'data-request', { ip })`
 * so each form has its own budget. Over it the action redirects to `/liikaa-pyyntoja`.
 */
export const publicFormRateLimiter = createRateLimiter({
  name: 'public-form',
  limit: 5,
  windowMs: 60 * 60 * 1000,
})

/**
 * Receipts per requester address per day, on top of the per-IP limit: someone rotating
 * addresses cannot use `/tietopyynto` to flood a third party's mailbox. Over it the request
 * still reaches the DPO; only the receipt is skipped.
 */
export const dataRequestReceiptLimiter = createRateLimiter({
  name: 'data-request-receipt',
  limit: 3,
  windowMs: 24 * 60 * 60 * 1000,
})

export type PublicFormOutcome =
  /** The message went to the inbox (and, for a data request, the receipt to the requester if `receipt`). */
  | { status: 'sent'; receipt?: boolean; reference?: string }
  /** The honeypot was filled: nothing was sent, the visitor sees the normal success. */
  | { status: 'ignored' }

/** "TP-" and 8 hex digits: quoted in both data-request emails so replies can be matched. */
export function dataRequestReference(): string {
  return `TP-${randomBytes(4).toString('hex').toUpperCase()}`
}

function receivedAt(now: Date): string {
  return formatSessionTime(now.toISOString(), DEFAULT_TIMEZONE)
}

/**
 * `/yhteystiedot` (MV-095): mail what the visitor wrote to `CONTACT_EMAIL` as `ContactReceived`,
 * `Reply-To` the visitor. A filled honeypot sends nothing. Nothing is stored: the email is
 * the only record (the inbox's retention is the service's, not this database's).
 */
export async function sendContactMessage(
  payload: Payload,
  values: ContactFormValues,
  now: Date = new Date(),
): Promise<PublicFormOutcome> {
  if (isSpam(values)) {
    logger.info({ form: 'contact' }, 'public form honeypot filled; nothing sent')
    return { status: 'ignored' }
  }
  const email = await renderContactReceived({
    name: values.name,
    email: values.email,
    message: values.message,
    receivedAt: receivedAt(now),
    baseUrl: env.NEXT_PUBLIC_SERVER_URL,
  })
  await payload.sendEmail({
    to: publicFormInboxes().contact,
    replyTo: values.email,
    subject: contactReceivedSubject(values.name),
    ...email,
  })
  return { status: 'sent' }
}

/**
 * `/tietopyynto` (MV-095): `DataRequestReceived` to `DPO_EMAIL` (`Reply-To` the requester), then
 * the receipt `DataRequestConfirmation` to the requester, both with the same reference. The
 * DPO email goes first, so a failure there never leaves a requester with a receipt for a
 * request nobody got. A filled honeypot sends nothing.
 */
export async function sendDataRequest(
  payload: Payload,
  values: DataRequestFormValues,
  now: Date = new Date(),
): Promise<PublicFormOutcome> {
  if (isSpam(values)) {
    logger.info({ form: 'data-request' }, 'public form honeypot filled; nothing sent')
    return { status: 'ignored' }
  }
  const reference = dataRequestReference()
  const baseUrl = env.NEXT_PUBLIC_SERVER_URL
  const at = receivedAt(now)

  const internal = await renderDataRequestReceived({
    reference,
    type: values.type,
    email: values.email,
    message: values.message,
    receivedAt: at,
    baseUrl,
  })
  await payload.sendEmail({
    to: publicFormInboxes().dpo,
    replyTo: values.email,
    subject: dataRequestReceivedSubject(reference),
    ...internal,
  })

  if (!(await dataRequestReceiptLimiter.check(values.email)).allowed) {
    return { status: 'sent', receipt: false, reference }
  }
  const receipt = await renderDataRequestConfirmation({
    reference,
    type: values.type,
    receivedAt: at,
    baseUrl,
  })
  await payload.sendEmail({
    to: values.email,
    subject: DATA_REQUEST_CONFIRMATION_SUBJECT,
    ...receipt,
  })
  return { status: 'sent', receipt: true, reference }
}
