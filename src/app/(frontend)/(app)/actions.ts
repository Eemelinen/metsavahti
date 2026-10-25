'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import { requireUser } from '@/lib/auth/guards'
import { actionResult } from '@/lib/errors'
import { acceptLegalDocuments as saveAcceptance } from '@/lib/legal/reacceptance'
import { reacceptanceSchema } from '@/lib/legal/reacceptance-schema'
import { clientIp } from '@/lib/privacy/ip'

/**
 * Server Actions shared by the `(app)` pages. `acceptLegalDocuments` is "Hyväksyn" of
 * `ReacceptanceBanner` (MV-086): it records the shown versions for the session's account;
 * `{ status: 'outdated' }` means a newer version was published meanwhile and nothing was saved.
 */
export async function acceptLegalDocuments(input: unknown) {
  return actionResult(async () => {
    const data = reacceptanceSchema.parse(input)
    const user = await requireUser()
    const requestHeaders = await headers()
    return saveAcceptance(await getPayload({ config }), user, data, {
      ip: clientIp(requestHeaders),
      userAgent: requestHeaders.get('user-agent'),
    })
  })
}
