import { type Payload, ValidationError } from 'payload'

import { planLimits } from '@/config/plans'
import { fi } from '@/i18n/fi'
import { assertOwner } from '@/lib/auth/page-access'
import { NotFound, PlanLimitReached } from '@/lib/errors'
import type { WatchAreaFormValues } from '@/lib/watch-areas/watch-area-schema'
import type { User, WatchArea } from '@/payload-types'

/**
 * Writes behind the watch-area Server Actions (E05 MV-064). Every function takes the account
 * from the session and goes through the `watch-areas` access rules as that user
 * (`overrideAccess: false`); an id from the browser is read first and its owner checked again
 * (`01 §9`), so it can only ever reach one of the account's own areas.
 */

/**
 * One of the account's own areas. Someone else's area is `NotFound` for a user (access control
 * hides it) and `Forbidden` for an admin (access control shows it, `assertOwner` refuses it):
 * the app pages are personal.
 */
async function findOwnWatchArea(payload: Payload, user: User, id: number): Promise<WatchArea> {
  const area = await payload.findByID({
    collection: 'watch-areas',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: false,
    user,
  })
  if (!area) throw new NotFound()
  assertOwner(user, area)
  return area
}

/** `{ lng, lat }` of the form → Payload's point (`[lng, lat]`, WGS 84). */
function toPoint({ lng, lat }: WatchAreaFormValues['center']): [number, number] {
  return [lng, lat]
}

/**
 * Creates a watch area owned by the account. The plan limit lives in the collection's
 * `beforeValidate` hook (`config/plans.ts`), so it holds for every write path; its refusal
 * arrives here as a `ValidationError` on `owner` with `fi.watchAreas.errors.planLimit` and leaves
 * as `PlanLimitReached`, whose message the forms show as it is (the admin UI shows the same).
 */
export async function createWatchArea(
  payload: Payload,
  user: User,
  values: WatchAreaFormValues,
): Promise<WatchArea> {
  try {
    return await payload.create({
      collection: 'watch-areas',
      data: {
        name: values.name,
        center: toPoint(values.center),
        radiusM: values.radiusM,
        addressLabel: values.addressLabel,
        notificationsEnabled: values.notificationsEnabled,
        owner: user.id,
      },
      depth: 0,
      overrideAccess: false,
      user,
    })
  } catch (error) {
    // Only the hook's own refusal: another `owner` error must not read as the plan limit.
    const message = fi.watchAreas.errors.planLimit(planLimits(user.plan).maxWatchAreas)
    if (
      error instanceof ValidationError &&
      error.data.errors.some((e) => e.path === 'owner' && e.message === message)
    ) {
      throw new PlanLimitReached(message, { cause: error })
    }
    throw error
  }
}

/**
 * Saves the edit form (`03-pages.md` `/vahtialueet/[id]/muokkaa`). The database recomputes the
 * buffered polygon (`geom_3067` is a generated column, D-003) and `lastCheckedAt` is cleared, so
 * the area reads as not yet checked until the next pipeline run matches it again.
 */
export async function updateWatchArea(
  payload: Payload,
  user: User,
  id: number,
  values: WatchAreaFormValues,
): Promise<WatchArea> {
  await findOwnWatchArea(payload, user, id)
  return payload.update({
    collection: 'watch-areas',
    id,
    data: {
      name: values.name,
      center: toPoint(values.center),
      radiusM: values.radiusM,
      addressLabel: values.addressLabel,
      notificationsEnabled: values.notificationsEnabled,
      lastCheckedAt: null,
    },
    depth: 0,
    overrideAccess: false,
    user,
  })
}

/**
 * Deletes one of the account's areas. Its `watch_area_declarations` rows and alerts go with it
 * through cascading foreign keys (migrations `watch_area_declarations_alerts` and
 * `alerts_watch_area_cascade`), and the notification-log links to those alerts with them.
 */
export async function deleteWatchArea(payload: Payload, user: User, id: number): Promise<void> {
  await findOwnWatchArea(payload, user, id)
  await payload.delete({
    collection: 'watch-areas',
    id,
    depth: 0,
    overrideAccess: false,
    user,
  })
}

/**
 * One area's own e-mail switch (`watch-areas.notificationsEnabled`), shared by `/vahtialueet`
 * and the override table of `/tili/ilmoitukset` (MV-054).
 */
export async function setWatchAreaNotifications(
  payload: Payload,
  user: User,
  id: number,
  enabled: boolean,
): Promise<void> {
  await findOwnWatchArea(payload, user, id)
  await payload.update({
    collection: 'watch-areas',
    id,
    data: { notificationsEnabled: enabled },
    depth: 0,
    overrideAccess: false,
    user,
  })
}
