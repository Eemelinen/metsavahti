import type { Payload } from 'payload'

import type { ProfileFormValues } from '@/lib/account/account-schema'
import type { User } from '@/payload-types'

/**
 * `/tili` (E04 MV-051): save the signed-in user's name, language and time zone. The id comes
 * from the session, never from the form, and the write goes through the `users` access rules
 * as that user (`isAdminOrSelf`), so a profile can only ever change its own row. Returns the
 * saved user.
 */
export async function updateUserProfile(
  payload: Payload,
  user: User,
  { name, locale, timezone }: ProfileFormValues,
): Promise<User> {
  return payload.update({
    collection: 'users',
    id: user.id,
    data: { name: name || null, locale, timezone },
    depth: 0,
    overrideAccess: false,
    user,
  })
}
