'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { loginUser, sessionCookie } from '@/lib/auth/login'
import {
  type LoginField,
  type LoginFieldErrors,
  loginFormSchema,
  safeNextPath,
} from '@/lib/auth/login-schema'
import { type ActionError, actionResult } from '@/lib/errors'

/** Why a login was refused; the form maps each to its copy (and a resend button for `unverified`). */
export type LoginDenied =
  { status: 'invalid' } | { status: 'locked' } | { status: 'unverified'; email: string }

/** What the `login` Server Action returns when it does not redirect. */
export type LoginActionResult =
  | { ok: false; fieldErrors: LoginFieldErrors; denied?: undefined; error?: undefined }
  | { ok: false; denied: LoginDenied; fieldErrors?: undefined; error?: undefined }
  | { ok: false; error: ActionError; fieldErrors?: undefined; denied?: undefined }

/**
 * Server Action `login` (E03 MV-044, `03-pages.md` `/kirjaudu`): validate, let Payload check
 * the credentials (its lockout counts the failures), set the session cookie for the chosen
 * length and go to `?next=` (same-origin only) or the app home. There is no per-IP limiter
 * here: Payload locks an account after five wrong passwords, and a per-address limit lower
 * than that would hide the "locked" answer the page is meant to show (D-017).
 */
export async function login(input: unknown): Promise<LoginActionResult> {
  const parsed = loginFormSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: LoginFieldErrors = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as LoginField | undefined
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
    }
    return { ok: false, fieldErrors }
  }
  const { email, password, remember, next } = parsed.data

  const payload = await getPayload({ config })
  const result = await actionResult(() => loginUser(payload, { email, password, remember }))
  if (!result.ok) return result
  const outcome = result.data
  if (outcome.status !== 'ok') return { ok: false, denied: outcome }

  const cookieStore = await cookies()
  cookieStore.set(sessionCookie(payload, outcome.token, outcome.ttlSeconds))
  redirect(safeNextPath(next))
}
