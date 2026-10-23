'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import {
  type RegisterActionResult,
  registerUser,
  validateRegistration,
  verifyEmailPath,
} from '@/lib/auth/registration'
import { actionResult } from '@/lib/errors'
import { clientIp } from '@/lib/privacy/ip'
import { authRateLimiter } from '@/lib/rate-limit'

/**
 * Server Action `register` (E03 MV-042, `03-pages.md` `/rekisteroidy`). Every call counts
 * against the per-IP limit, then the input is validated on the server regardless of what
 * the form already checked. A duplicate address gets the same redirect as a new account so
 * the form never reveals who has one.
 */
export async function register(input: unknown): Promise<RegisterActionResult> {
  const requestHeaders = await headers()
  const ip = clientIp(requestHeaders)
  const userAgent = requestHeaders.get('user-agent')

  const limited = await actionResult(() => authRateLimiter.assert(`register:${ip ?? 'unknown'}`))
  if (!limited.ok) return limited

  const validation = validateRegistration(input)
  if (!validation.success) return { ok: false, fieldErrors: validation.fieldErrors }

  const result = await actionResult(async () => {
    const payload = await getPayload({ config })
    await registerUser(payload, validation.data, { ip, userAgent })
  })
  if (!result.ok) return result

  redirect(verifyEmailPath(validation.data.email))
}
