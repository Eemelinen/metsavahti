import { unstable_rethrow } from 'next/navigation'

import { type Logger, logger as defaultLogger } from '@/lib/logger'

/**
 * Typed application errors and the one place that maps them to responses.
 *
 * Throw an `AppError` subclass anywhere on the server; the two exits from the server are
 * `actionResult()` (Server Actions → `{ ok, data | error }`) and `toErrorResponse()`
 * (Route Handlers → `Response`). Both go through `toActionError()`, so an error is
 * translated the same way wherever it surfaces. Unknown errors become `internal`
 * with a generic Finnish message; their real message is logged, never sent.
 */

export type ErrorCode = 'not_found' | 'forbidden' | 'rate_limited' | 'external_service' | 'internal'

/** The error shape a client receives. `message` is Finnish UI copy. */
export interface ActionError {
  code: ErrorCode
  message: string
  /** Only on `rate_limited`: how long to wait before trying again. */
  retryAfterSeconds?: number
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }

/** Generic messages used whenever the real message must not reach the client. */
export const publicMessages: Record<ErrorCode, string> = {
  not_found: 'Kohdetta ei löytynyt.',
  forbidden: 'Ei käyttöoikeutta.',
  rate_limited: 'Liikaa pyyntöjä. Yritä hetken kuluttua uudelleen.',
  external_service: 'Ulkoinen palvelu ei vastannut. Yritä myöhemmin uudelleen.',
  internal: 'Jotain meni pieleen. Yritä myöhemmin uudelleen.',
}

export interface AppErrorOptions {
  /** Original error, kept for logs. */
  cause?: unknown
  /**
   * Whether `message` may be shown to the client. Subclasses set a sensible default:
   * user-facing errors (not found, forbidden, rate limited) expose it, technical ones do not.
   */
  expose?: boolean
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly expose: boolean

  constructor(
    code: ErrorCode,
    status: number,
    message: string = publicMessages[code],
    options: AppErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.expose = options.expose ?? false
  }

  /** What the client sees. Hides `message` unless it was marked safe. */
  toActionError(): ActionError {
    return { code: this.code, message: this.expose ? this.message : publicMessages[this.code] }
  }
}

export class NotFound extends AppError {
  constructor(message?: string, options: AppErrorOptions = {}) {
    super('not_found', 404, message, { expose: true, ...options })
    this.name = 'NotFound'
  }
}

export class Forbidden extends AppError {
  constructor(message?: string, options: AppErrorOptions = {}) {
    super('forbidden', 403, message, { expose: true, ...options })
    this.name = 'Forbidden'
  }
}

export class RateLimited extends AppError {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number, message?: string, options: AppErrorOptions = {}) {
    super('rate_limited', 429, message, { expose: true, ...options })
    this.name = 'RateLimited'
    this.retryAfterSeconds = Math.max(0, Math.ceil(retryAfterSeconds))
  }

  override toActionError(): ActionError {
    return { ...super.toActionError(), retryAfterSeconds: this.retryAfterSeconds }
  }
}

/** An upstream we depend on (WFS, geocoder, email provider) failed. 502, message stays server-side. */
export class ExternalServiceError extends AppError {
  readonly service: string

  constructor(service: string, message?: string, options: AppErrorOptions = {}) {
    super('external_service', 502, message ?? `${service} failed`, options)
    this.name = 'ExternalServiceError'
    this.service = service
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

interface MappingOptions {
  /** Injected in tests; defaults to the application logger. */
  logger?: Pick<Logger, 'error' | 'warn'>
}

/**
 * The one mapping from a thrown value to `{ status, error }`.
 *
 * - `AppError` → its status and `toActionError()`.
 * - Anything else → 500 `internal` with the generic message.
 * - Errors with status ≥ 500 are logged at `error` level with their cause; 4xx are the
 *   caller's business and are not logged here.
 */
export function toActionError(
  error: unknown,
  { logger = defaultLogger }: MappingOptions = {},
): { status: number; error: ActionError } {
  if (isAppError(error)) {
    if (error.status >= 500) {
      logger.error({ err: error, code: error.code, cause: error.cause }, error.message)
    }
    return { status: error.status, error: error.toActionError() }
  }
  logger.error({ err: error }, 'unhandled error')
  return { status: 500, error: { code: 'internal', message: publicMessages.internal } }
}

/**
 * Wrap a Server Action body so it never throws to the client.
 *
 * ```ts
 * export async function deleteWatchArea(id: string) {
 *   return actionResult(async () => {
 *     const user = await requireUser()      // throws Forbidden
 *     ...
 *     return { id }
 *   })
 * }
 * ```
 *
 * Next.js navigation errors (`redirect()`, `notFound()`) are rethrown so the framework
 * still handles them.
 */
export async function actionResult<T>(
  fn: () => T | Promise<T>,
  options: MappingOptions = {},
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (error) {
    unstable_rethrow(error)
    return { ok: false, error: toActionError(error, options).error }
  }
}

/**
 * Route Handler counterpart of `actionResult`: the same mapping as a JSON `Response`
 * (`{ ok: false, error }`), with `Retry-After` on 429. Navigation errors are rethrown.
 */
export function toErrorResponse(error: unknown, options: MappingOptions = {}): Response {
  unstable_rethrow(error)
  const { status, error: body } = toActionError(error, options)
  const headers = new Headers()
  if (body.retryAfterSeconds !== undefined) {
    headers.set('Retry-After', String(body.retryAfterSeconds))
  }
  return Response.json({ ok: false, error: body }, { status, headers })
}
