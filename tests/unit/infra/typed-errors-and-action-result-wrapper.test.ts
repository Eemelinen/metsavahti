import { notFound, redirect } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'

import {
  actionResult,
  AppError,
  ExternalServiceError,
  Forbidden,
  isAppError,
  NotFound,
  publicMessages,
  RateLimited,
  toActionError,
  toErrorResponse,
} from '@/lib/errors'

function silentLogger() {
  return { error: vi.fn(), warn: vi.fn() }
}

function digestOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'digest' in error
    ? String(error.digest)
    : undefined
}

describe('AppError subclasses', () => {
  it.each([
    [new NotFound(), 'NotFound', 'not_found', 404, true],
    [new Forbidden(), 'Forbidden', 'forbidden', 403, true],
    [new RateLimited(30), 'RateLimited', 'rate_limited', 429, true],
    [new ExternalServiceError('wfs'), 'ExternalServiceError', 'external_service', 502, false],
  ] as const)('%s carries name, code, status and exposure', (error, name, code, status, expose) => {
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(AppError)
    expect(isAppError(error)).toBe(true)
    expect(error.name).toBe(name)
    expect(error.code).toBe(code)
    expect(error.status).toBe(status)
    expect(error.expose).toBe(expose)
  })

  it('uses the Finnish public message by default and accepts a custom one', () => {
    expect(new NotFound().message).toBe(publicMessages.not_found)
    expect(new Forbidden().message).toBe(publicMessages.forbidden)
    expect(new RateLimited(5).message).toBe(publicMessages.rate_limited)
    expect(new NotFound('Valvonta-aluetta ei löytynyt.').message).toBe(
      'Valvonta-aluetta ei löytynyt.',
    )
  })

  it('keeps the cause for logs', () => {
    const cause = new Error('socket hang up')
    const error = new ExternalServiceError('wfs', 'WFS responded 502', { cause })
    expect(error.cause).toBe(cause)
    expect(error.service).toBe('wfs')
    expect(error.message).toBe('WFS responded 502')
    expect(new ExternalServiceError('geocoder').message).toBe('geocoder failed')
  })

  it('RateLimited rounds the wait up to whole seconds and never below zero', () => {
    expect(new RateLimited(12.2).retryAfterSeconds).toBe(13)
    expect(new RateLimited(-1).retryAfterSeconds).toBe(0)
    expect(new RateLimited(30).toActionError()).toEqual({
      code: 'rate_limited',
      message: publicMessages.rate_limited,
      retryAfterSeconds: 30,
    })
  })

  it('only exposes messages that were marked safe', () => {
    expect(new NotFound('Aluetta ei ole.').toActionError().message).toBe('Aluetta ei ole.')
    expect(new ExternalServiceError('wfs', 'secret host down').toActionError().message).toBe(
      publicMessages.external_service,
    )
    expect(
      new ExternalServiceError('wfs', 'Metsäkeskus ei vastaa.', { expose: true }).toActionError()
        .message,
    ).toBe('Metsäkeskus ei vastaa.')
    expect(isAppError(new Error('plain'))).toBe(false)
  })
})

describe('toActionError (the one mapping)', () => {
  it('maps an AppError to its status and client shape without logging 4xx', () => {
    const logger = silentLogger()
    expect(toActionError(new Forbidden(), { logger })).toEqual({
      status: 403,
      error: { code: 'forbidden', message: publicMessages.forbidden },
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs 5xx AppErrors with their cause', () => {
    const logger = silentLogger()
    const cause = new Error('ECONNRESET')
    const error = new ExternalServiceError('wfs', 'WFS responded 502', { cause })
    expect(toActionError(error, { logger })).toEqual({
      status: 502,
      error: { code: 'external_service', message: publicMessages.external_service },
    })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, code: 'external_service', cause }),
      'WFS responded 502',
    )
  })

  it('turns anything else into a logged 500 with the generic message', () => {
    const logger = silentLogger()
    expect(toActionError(new Error('SELECT * FROM secrets'), { logger })).toEqual({
      status: 500,
      error: { code: 'internal', message: publicMessages.internal },
    })
    expect(toActionError('boom', { logger }).status).toBe(500)
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'boom' }),
      'unhandled error',
    )
  })
})

describe('actionResult', () => {
  it('returns ok with the data of a sync or async body', async () => {
    await expect(actionResult(() => 42)).resolves.toEqual({ ok: true, data: 42 })
    await expect(actionResult(async () => ({ id: 'a' }))).resolves.toEqual({
      ok: true,
      data: { id: 'a' },
    })
  })

  it('returns the mapped error for a thrown AppError', async () => {
    const logger = silentLogger()
    const result = await actionResult(
      () => {
        throw new NotFound('Valvonta-aluetta ei löytynyt.')
      },
      { logger },
    )
    expect(result).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'Valvonta-aluetta ei löytynyt.' },
    })
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('never leaks an unknown error to the client', async () => {
    const logger = silentLogger()
    const result = await actionResult(
      async () => {
        throw new TypeError('cannot read properties of undefined')
      },
      { logger },
    )
    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', message: publicMessages.internal },
    })
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('narrows the union on ok', async () => {
    const result = await actionResult(() => 'x')
    // Type-level check: `data` is only reachable after narrowing on `ok`.
    const upper = result.ok ? result.data.toUpperCase() : result.error.code
    expect(upper).toBe('X')
  })

  it('rethrows Next.js navigation errors instead of wrapping them', async () => {
    const logger = silentLogger()
    await expect(actionResult(() => redirect('/kirjaudu'), { logger })).rejects.toSatisfy(
      (error) => digestOf(error)?.startsWith('NEXT_REDIRECT') === true,
    )
    await expect(actionResult(() => notFound(), { logger })).rejects.toSatisfy(
      (error) => digestOf(error)?.startsWith('NEXT_HTTP_ERROR_FALLBACK;404') === true,
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('rethrows a navigation error hidden in a cause chain', async () => {
    let navigation: unknown
    try {
      redirect('/')
    } catch (error) {
      navigation = error
    }
    await expect(
      actionResult(() => {
        throw new ExternalServiceError('wfs', 'wrapped', { cause: navigation })
      }),
    ).rejects.toBe(navigation)
  })
})

describe('toErrorResponse', () => {
  it('serialises the same mapping as JSON with the status', async () => {
    const response = toErrorResponse(new Forbidden(), { logger: silentLogger() })
    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('retry-after')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: 'forbidden', message: publicMessages.forbidden },
    })
  })

  it('adds Retry-After for rate limits', async () => {
    const response = toErrorResponse(new RateLimited(60), { logger: silentLogger() })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: publicMessages.rate_limited,
        retryAfterSeconds: 60,
      },
    })
  })

  it('answers 500 with the generic message for unknown errors', async () => {
    const logger = silentLogger()
    const response = toErrorResponse(new Error('db password wrong'), { logger })
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: publicMessages.internal },
    })
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('rethrows navigation errors', () => {
    expect(() => {
      try {
        redirect('/')
      } catch (error) {
        toErrorResponse(error)
      }
    }).toThrowError(expect.objectContaining({ digest: expect.stringMatching(/^NEXT_REDIRECT/) }))
  })
})
