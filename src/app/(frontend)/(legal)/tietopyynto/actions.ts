'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fieldErrorsOf } from '@/lib/account/account-schema'
import { actionResult } from '@/lib/errors'
import { clientIp } from '@/lib/privacy/ip'
import { sendDataRequest, publicFormRateLimiter } from '@/lib/public-forms/public-forms'
import {
  type DataRequestField,
  type PublicFormActionResult,
  dataRequestFormSchema,
} from '@/lib/public-forms/public-forms-schema'
import { limitFormPost, rateLimitKey } from '@/lib/rate-limit'

/**
 * Server Action `submitDataRequest` (`03-pages.md` `/tietopyynto`, MV-095): the per-IP limit
 * (5/h, redirect to `/liikaa-pyyntoja` over it), server-side validation, then
 * `DataRequestReceived` to `DPO_EMAIL` and the receipt to the requester. A filled honeypot
 * gets the same success as a real request.
 */
export async function submitDataRequest(
  input: unknown,
): Promise<PublicFormActionResult<DataRequestField>> {
  const ip = clientIp(await headers())
  await limitFormPost(publicFormRateLimiter, rateLimitKey('data-request', { ip }))

  const parsed = dataRequestFormSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf<DataRequestField>(parsed.error) }
  }

  return actionResult(async () => {
    const payload = await getPayload({ config })
    await sendDataRequest(payload, parsed.data)
    return { sent: true as const }
  })
}
