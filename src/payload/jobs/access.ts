import { timingSafeEqual } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import { env } from '@/lib/env'
import { isAdminUser } from '@/payload/access'

/** Constant-time comparison of a bearer token against CRON_SECRET. */
export function hasValidCronSecret(authorization: string | null | undefined): boolean {
  if (!authorization?.startsWith('Bearer ')) return false
  const token = Buffer.from(authorization.slice('Bearer '.length))
  const secret = Buffer.from(env.CRON_SECRET)
  return token.length === secret.length && timingSafeEqual(token, secret)
}

/** Payload `jobs.access.run`: cron with the shared secret, or an admin user. */
export function canRunJobs({ req }: { req: PayloadRequest }): boolean {
  return hasValidCronSecret(req.headers.get('authorization')) || isAdminUser(req.user)
}
