'use server'

import { refresh } from 'next/cache'
import { getPayload } from 'payload'
import { z } from 'zod'

import config from '@payload-config'
import { refreshOwnAlertBadge } from '@/lib/alerts/badge'
import {
  markAlertRead as stampAlertRead,
  markAllAlertsRead as stampAllAlertsRead,
} from '@/lib/alerts/unread'
import { requireUser } from '@/lib/auth/guards'
import { type ActionResult, actionResult } from '@/lib/errors'
import { watchAreaIdSchema } from '@/lib/watch-areas/watch-area-schema'

/**
 * Alert Server Actions (E07 MV-080, MV-082), used by `/ilmoitukset` and `/ilmoitukset/[id]`.
 * The account comes from the session (`requireUser()`); the alert id from the browser is
 * checked against it again in `lib/alerts/unread.ts`. Both expire the account's cached badge
 * count (`refreshOwnAlertBadge()`, MV-083) and refresh the client router, so the nav badge of
 * the `(app)` layout shows the new unread count without a reload (a layout does not re-render
 * on client-side navigation).
 */

const alertIdSchema = z.number().int().positive()

/** Marks one of the account's alerts read (`/ilmoitukset/[id]` on view, MV-082). */
export async function markAlertRead(
  id: unknown,
): Promise<ActionResult<{ id: number; readAt: string }>> {
  return actionResult(async () => {
    const alertId = alertIdSchema.parse(id)
    const user = await requireUser()
    const result = await stampAlertRead(await getPayload({ config }), user, alertId)
    refreshOwnAlertBadge(user)
    refresh()
    return result
  })
}

/** "Merkitse kaikki luetuiksi": every unread alert of the account, or of the filtered area. */
export async function markAllAlertsRead(
  watchAreaId: unknown = null,
): Promise<ActionResult<{ count: number }>> {
  return actionResult(async () => {
    const areaId = watchAreaIdSchema.nullable().parse(watchAreaId)
    const user = await requireUser()
    const result = await stampAllAlertsRead(await getPayload({ config }), user, {
      watchAreaId: areaId,
    })
    refreshOwnAlertBadge(user)
    refresh()
    return result
  })
}
