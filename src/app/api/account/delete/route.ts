import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { requestAccountDeletion } from '@/lib/account/account-deletion'
import {
  ACCOUNT_DELETED_PATH,
  type DeleteAccountField,
  type DeleteAccountFieldErrors,
  deleteAccountFormSchema,
  fieldErrorsOf,
} from '@/lib/account/account-schema'
import { requireUser } from '@/lib/auth/guards'
import { expiredSessionCookie } from '@/lib/auth/login'
import { RateLimited, toErrorResponse } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function rejected(fieldErrors: DeleteAccountFieldErrors): Response {
  return Response.json({ ok: false, fieldErrors }, { status: 422 })
}

/**
 * "Poista tili pysyvästi" on `/tili/poista` (`01 §6`, E08 MV-094). JSON only, like
 * `POST /api/account/export`, so a cross-site form cannot post it. `POISTA` and the password
 * are checked (422 with `fieldErrors` otherwise); then every session ends, the
 * `delete-account` job is queued and run before the answer, so the page it sends the browser
 * to (`data.redirect`, `/tili-poistettu`) tells the truth. If the run fails, the job stays
 * queued with its retries for the cron's queue drain; the account is already signed out
 * everywhere and cannot log in. Logic: `lib/account/account-deletion.ts`.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return Response.json({ ok: false, error: 'unsupported_media_type' }, { status: 415 })
    }
    const user = await requireUser()
    const parsed = deleteAccountFormSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return rejected(fieldErrorsOf<DeleteAccountField>(parsed.error))

    const payload = await getPayload({ config })
    const outcome = await requestAccountDeletion(payload, user, parsed.data)
    if (outcome.status === 'limited') throw new RateLimited(outcome.retryAfterSeconds)
    if (outcome.status === 'rejected') return rejected(outcome.fieldErrors)

    try {
      await payload.jobs.runByID({ id: outcome.jobId })
    } catch (err) {
      logger.error({ err, jobId: outcome.jobId }, 'could not run the delete-account job')
    }
    const response = NextResponse.json({ ok: true, data: { redirect: ACCOUNT_DELETED_PATH } })
    response.cookies.set(expiredSessionCookie(payload))
    return response
  } catch (error) {
    return toErrorResponse(error)
  }
}
