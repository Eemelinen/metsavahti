import { z } from 'zod'

import { fi } from '@/i18n/fi'
import { isInsideFinland, to3067 } from '@/lib/geo/crs'

const copy = fi.watchAreas.errors

/** Radius bounds of a watch area (`01 §3.2`); the `watch-areas` collection enforces them too. */
export const MIN_RADIUS_M = 100
export const MAX_RADIUS_M = 5_000

export const MAX_WATCH_AREA_NAME_LENGTH = 100
export const MAX_ADDRESS_LABEL_LENGTH = 200

const radiusMessage = copy.radiusInvalid(MIN_RADIUS_M, MAX_RADIUS_M)

/**
 * A watch area as the create and edit forms send it (E05 MV-064). Browser-safe: the wizard
 * (MV-065) and the edit page validate with it before the round trip and the Server Action
 * again. `center` is WGS 84 and must lie in Finland (the WFS covers nothing else). An empty
 * address label clears it. `notificationsEnabled` is optional so an edit form without the
 * switch leaves it as it is; a new area without it gets the collection default (on).
 */
export const watchAreaFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, copy.nameMissing)
    .max(MAX_WATCH_AREA_NAME_LENGTH, copy.nameTooLong),
  center: z
    .object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) })
    .refine(({ lng, lat }) => isInsideFinland(to3067([lng, lat])), copy.centerOutside),
  radiusM: z
    .number(radiusMessage)
    .int(radiusMessage)
    .min(MIN_RADIUS_M, radiusMessage)
    .max(MAX_RADIUS_M, radiusMessage),
  addressLabel: z
    .string()
    .trim()
    .max(MAX_ADDRESS_LABEL_LENGTH, copy.addressTooLong)
    .transform((label) => label || null)
    .nullish(),
  notificationsEnabled: z.boolean().optional(),
})

export type WatchAreaFormValues = z.infer<typeof watchAreaFormSchema>
export type WatchAreaField = keyof WatchAreaFormValues
export type WatchAreaFieldErrors = Partial<Record<WatchAreaField, string>>

/** The id of one of the account's watch areas, as `updateWatchArea` / `deleteWatchArea` get it. */
export const watchAreaIdSchema = z.number().int().positive()

/** The `[id]` of the page and the endpoint as a row id; anything else (`abc`, `01`, `-1`) is null. */
export function watchAreaIdParam(param: string): number | null {
  // Nine digits stay inside Postgres `integer`.
  return /^[1-9]\d{0,8}$/.test(param) ? Number(param) : null
}
