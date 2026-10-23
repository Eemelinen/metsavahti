import type { Access, FieldAccess, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'

export function isAdminUser(
  user: PayloadRequest['user'] | null | undefined,
): user is User & { role: 'admin' } {
  return Boolean(user && user.collection === 'users' && (user as User).role === 'admin')
}

/** Collection access: admins only. */
export const isAdmin: Access = ({ req }) => isAdminUser(req.user)

/** Collection access: any logged-in user. */
export const isAuthenticated: Access = ({ req }) => Boolean(req.user)

/** Field access: admins only. */
export const isAdminField: FieldAccess = ({ req }) => isAdminUser(req.user)

/**
 * Collection access: admins see everything, other users only documents whose
 * `ownerField` relationship points at themselves (returns a query constraint).
 */
export function isAdminOrOwner(ownerField: string): Access {
  return ({ req }) => {
    if (isAdminUser(req.user)) return true
    if (!req.user) return false
    return { [ownerField]: { equals: req.user.id } }
  }
}

/** Collection access for `users`: admins everything, users only themselves. */
export const isAdminOrSelf: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true
  if (!req.user) return false
  return { id: { equals: req.user.id } }
}
