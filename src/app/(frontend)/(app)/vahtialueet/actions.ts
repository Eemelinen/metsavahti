'use server'

import { getPayload } from 'payload'

import config from '@payload-config'
import { fieldErrorsOf, watchAreaNotificationsSchema } from '@/lib/account/account-schema'
import { refreshOwnAlertBadge } from '@/lib/alerts/badge'
import { requireUser } from '@/lib/auth/guards'
import { type ActionError, type ActionResult, actionResult } from '@/lib/errors'
import {
  type WatchAreaField,
  type WatchAreaFieldErrors,
  watchAreaFormSchema,
  watchAreaIdSchema,
} from '@/lib/watch-areas/watch-area-schema'
import {
  createWatchArea as saveNewWatchArea,
  deleteWatchArea as removeWatchArea,
  setWatchAreaNotifications,
  updateWatchArea as saveWatchArea,
} from '@/lib/watch-areas/watch-areas'

/**
 * Watch-area Server Actions (E05 MV-064), used by the wizard `/aloita` (MV-065), the list
 * `/vahtialueet` (MV-066) and the edit page `/vahtialueet/[id]/muokkaa`. The account always
 * comes from the session (`requireUser()`); ids from the browser are checked against it again in
 * `lib/watch-areas/watch-areas.ts`. A form input that fails `watchAreaFormSchema` comes back as
 * field errors; a malformed id or switch value is a bug or tampering, so its parse throws and
 * `actionResult()` answers with the generic error. A third area on the free plan is
 * `{ code: 'plan_limit', message }` with the message ready for the form. The callers navigate
 * or refresh themselves (the wizard goes to `/vahtialueet/[id]?created=1`).
 */

export type WatchAreaFormActionResult =
  | { ok: true; data: { id: number }; fieldErrors?: undefined; error?: undefined }
  | { ok: false; fieldErrors: WatchAreaFieldErrors; error?: undefined }
  | { ok: false; error: ActionError; fieldErrors?: undefined }

function invalidForm(error: Parameters<typeof fieldErrorsOf>[0]): WatchAreaFormActionResult {
  return { ok: false, fieldErrors: fieldErrorsOf<WatchAreaField>(error) }
}

/** Save a new watch area for the signed-in account. */
export async function createWatchArea(input: unknown): Promise<WatchAreaFormActionResult> {
  const parsed = watchAreaFormSchema.safeParse(input)
  if (!parsed.success) return invalidForm(parsed.error)
  return actionResult(async () => {
    const user = await requireUser()
    const area = await saveNewWatchArea(await getPayload({ config }), user, parsed.data)
    return { id: area.id }
  })
}

/** Save the edit form of one of the account's areas; clears `lastCheckedAt`. */
export async function updateWatchArea(
  id: unknown,
  input: unknown,
): Promise<WatchAreaFormActionResult> {
  const parsed = watchAreaFormSchema.safeParse(input)
  if (!parsed.success) return invalidForm(parsed.error)
  return actionResult(async () => {
    const areaId = watchAreaIdSchema.parse(id)
    const user = await requireUser()
    await saveWatchArea(await getPayload({ config }), user, areaId, parsed.data)
    return { id: areaId }
  })
}

/**
 * Delete one of the account's areas together with its matches and alerts; the alerts leave
 * the nav badge too (MV-083).
 */
export async function deleteWatchArea(id: unknown): Promise<ActionResult<{ id: number }>> {
  return actionResult(async () => {
    const areaId = watchAreaIdSchema.parse(id)
    const user = await requireUser()
    await removeWatchArea(await getPayload({ config }), user, areaId)
    refreshOwnAlertBadge(user)
    return { id: areaId }
  })
}

/** The notification switch of one row on `/vahtialueet`. */
export async function toggleWatchAreaNotifications(
  input: unknown,
): Promise<ActionResult<{ id: number; enabled: boolean }>> {
  return actionResult(async () => {
    const { id, enabled } = watchAreaNotificationsSchema.parse(input)
    const user = await requireUser()
    await setWatchAreaNotifications(await getPayload({ config }), user, id, enabled)
    return { id, enabled }
  })
}
