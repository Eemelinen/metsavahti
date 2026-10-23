import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access'

const deny = () => false

/**
 * What a device list needs about a login session and Payload's `users.sessions` does not keep
 * (E04 MV-051, D-023): the browser's `User-Agent` and when the session was last seen. One row
 * per session id (`sid`, the `useSessions` id in the JWT); `users.sessions` stays the only
 * authority on whether a session is live, so a row whose session has ended is ignored and
 * deleted the next time the list is read. Only `src/lib/account/sessions.ts` writes it;
 * admins read it.
 */
export const UserSessions: CollectionConfig = {
  slug: 'user-sessions',
  labels: { singular: 'Istunto', plural: 'Istunnot' },
  admin: {
    useAsTitle: 'sid',
    defaultColumns: ['user', 'userAgent', 'lastSeenAt', 'createdAt'],
    group: 'Käyttäjät',
  },
  access: {
    read: isAdmin,
    create: deny,
    update: deny,
    delete: deny,
  },
  fields: [
    // Not required: the account deletion job removes the rows before the user, and a NOT NULL
    // column would turn the relationship's `ON DELETE SET NULL` into a failing delete.
    { name: 'user', type: 'relationship', relationTo: 'users', index: true, label: 'Käyttäjä' },
    { name: 'sid', type: 'text', required: true, unique: true, label: 'Istunnon tunniste' },
    { name: 'userAgent', type: 'text', label: 'Selain (User-Agent)' },
    { name: 'lastSeenAt', type: 'date', required: true, label: 'Viimeksi nähty' },
  ],
}
