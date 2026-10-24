'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fieldErrorsOf } from '@/lib/account/account-schema'
import { actionResult } from '@/lib/errors'
import { clientIp } from '@/lib/privacy/ip'
import { sendContactMessage, publicFormRateLimiter } from '@/lib/public-forms/public-forms'
import {
  type ContactField,
  type PublicFormActionResult,
  contactFormSchema,
} from '@/lib/public-forms/public-forms-schema'
import { limitFormPost, rateLimitKey } from '@/lib/rate-limit'

/**
 * Server Action `submitContact` (`03-pages.md` `/yhteystiedot`, MV-095): every call counts
 * against the per-IP limit (5/h; over it: redirect to `/liikaa-pyyntoja`, MV-048), the input
 * is validated again on the server, then `ContactReceived` goes to `CONTACT_EMAIL`. A filled
 * honeypot gets the same success as a real message.
 */
export async function submitContact(input: unknown): Promise<PublicFormActionResult<ContactField>> {
  const ip = clientIp(await headers())
  await limitFormPost(publicFormRateLimiter, rateLimitKey('contact', { ip }))

  const parsed = contactFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf<ContactField>(parsed.error) }
  }

  return actionResult(async () => {
    const payload = await getPayload({ config })
    await sendContactMessage(payload, parsed.data)
    return { sent: true as const }
  })
}
