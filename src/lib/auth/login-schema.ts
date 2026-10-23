import { z } from 'zod'

import { fi } from '@/i18n/fi'

const copy = fi.auth.login.errors

/** Where a login lands when `?next=` is missing or unsafe (the app home; `/vahtialueet` after MV-05x). */
export const DEFAULT_AFTER_LOGIN = '/dashboard'

/** The login page; `loginPath()` adds the return address. */
export const LOGIN_PATH = '/kirjaudu'

/** Session length in seconds (E03 MV-044): 30 days with "Muista minut", one day without. */
export const SESSION_TTL_SECONDS = {
  remembered: 30 * 24 * 60 * 60,
  standard: 24 * 60 * 60,
} as const

/**
 * Input of the `login` Server Action. Browser-safe like `registration-schema.ts`: the address
 * is normalised the way registration stored it, the password only has to be present (its
 * rules are checked at registration, never on login) and `next` is sanitised again on the
 * server by `safeNextPath()`.
 */
export const loginFormSchema = z.object({
  email: z.email(copy.emailInvalid).trim().toLowerCase(),
  password: z.string().min(1, copy.passwordMissing),
  remember: z.boolean(),
  next: z.string().optional(),
})

export type LoginFormValues = z.infer<typeof loginFormSchema>
export type LoginField = 'email' | 'password'
export type LoginFieldErrors = Partial<Record<LoginField, string>>

/**
 * `?next=` handling, same-origin only: the value must be an absolute path on this origin
 * (`/vahtialueet/3`), never a URL (`https://evil.example`), a protocol-relative one (`//evil`),
 * a backslash variant browsers normalise to one, or something with control characters.
 * Anything else falls back to `DEFAULT_AFTER_LOGIN`; the login page itself is never a target
 * (it would loop).
 */
export function safeNextPath(raw: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback
  const path = raw.split(/[?#]/)[0] ?? ''
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)) return fallback
  return raw
}

/** `/kirjaudu`, with `?next=` when there is a page to return to (`01 §7`: `/kirjaudu?next=`). */
export function loginPath(next?: string): string {
  if (!next) return LOGIN_PATH
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
}

/** Seconds a session created with (or without) "Muista minut" lasts. */
export function sessionTtlSeconds(remember: boolean): number {
  return remember ? SESSION_TTL_SECONDS.remembered : SESSION_TTL_SECONDS.standard
}
