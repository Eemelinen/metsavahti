import { headers } from 'next/headers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestPasswordReset } from '@/app/(frontend)/(auth)/unohtunut-salasana/actions'
import { resetPassword } from '@/app/(frontend)/(auth)/uusi-salasana/actions'
import {
  RESET_PASSWORD_SUBJECT,
  renderResetPassword,
  resetPasswordUrl,
} from '@/emails/ResetPassword'
import { fi } from '@/i18n/fi'
import type * as PasswordReset from '@/lib/auth/password-reset'
import {
  requestPasswordReset as sendResetEmail,
  resetUserPassword,
} from '@/lib/auth/password-reset'
import {
  AFTER_RESET_PATH,
  RESET_LINK_TTL_MS,
  forgotPasswordSchema,
  resetPasswordFormSchema,
} from '@/lib/auth/password-reset-schema'
import { publicMessages } from '@/lib/errors'
import { authRateLimiter } from '@/lib/rate-limit'

// Both actions run without a request context: `headers()` is stubbed, Payload is never
// booted and the two library helpers are spies (their real bodies are covered by the
// integration test); `redirect()` is the real one (it throws the `NEXT_REDIRECT` digest).
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/auth/password-reset', async (importOriginal) => ({
  ...(await importOriginal<typeof PasswordReset>()),
  requestPasswordReset: vi.fn(),
  resetUserPassword: vi.fn(),
}))

const PASSWORD = 'kuusi-metsa-jarvi-2026'

function requestFrom(ip: string) {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': ip }) as never)
}

/** MV-045: schemas, the reset email, the two actions. */
describe('forgot / reset password schemas', () => {
  it('normalises the address and refuses an unusable one', () => {
    expect(forgotPasswordSchema.parse({ email: 'Anna.K@Example.fi' })).toEqual({
      email: 'anna.k@example.fi',
    })
    const failed = forgotPasswordSchema.safeParse({ email: 'anna' })
    expect(failed.success).toBe(false)
    expect(failed.error?.issues[0]?.message).toBe(fi.auth.forgotPassword.errors.emailInvalid)
  })

  it('requires the token, ten characters and a matching confirmation', () => {
    expect(
      resetPasswordFormSchema.safeParse({
        token: 'abc',
        password: PASSWORD,
        confirmPassword: PASSWORD,
      }).success,
    ).toBe(true)
    const failed = resetPasswordFormSchema.safeParse({
      token: '',
      password: 'lyhyt',
      confirmPassword: 'lyhyt',
    })
    expect(failed.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['token', fi.auth.resetPassword.errors.tokenMissing],
      ['password', fi.auth.resetPassword.errors.passwordTooShort],
    ])
    const mismatch = resetPasswordFormSchema.safeParse({
      token: 'abc',
      password: PASSWORD,
      confirmPassword: 'jotain-muuta-2026',
    })
    expect(mismatch.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['confirmPassword', fi.auth.resetPassword.errors.passwordMismatch],
    ])
  })

  it('the link lives for one hour and the success lands on the login banner', () => {
    expect(RESET_LINK_TTL_MS).toBe(60 * 60 * 1000)
    expect(AFTER_RESET_PATH).toBe('/kirjaudu?reset=1')
  })
})

describe('reset password email', () => {
  it('renders template 2 with the token link, the fallback URL, the note and the attribution', async () => {
    const { html, text } = await renderResetPassword({
      token: 'abc/123',
      baseUrl: 'https://metsavahti.fi',
      attribution: 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 09/2026',
    })
    expect(RESET_PASSWORD_SUBJECT).toBe('Salasanan palautus')
    expect(resetPasswordUrl('https://metsavahti.fi', 'abc/123')).toBe(
      'https://metsavahti.fi/uusi-salasana?token=abc%2F123',
    )
    expect(html).toContain('Salasanan palautus')
    expect(html).toContain('Turvallisuus')
    expect(html).toContain('Aseta uusi salasana')
    expect(html).toContain('https://metsavahti.fi/uusi-salasana?token=abc%2F123')
    expect(html).toContain('Jos painike ei toimi')
    expect(html).toContain('Jos et pyytänyt salasanan vaihtoa')
    expect(html).toContain('Metsänkäyttöilmoitukset-aineistoa 09/2026')
    expect(text).toContain('https://metsavahti.fi/uusi-salasana?token=abc%2F123')
  })
})

describe('requestPasswordReset action', () => {
  beforeEach(() => {
    authRateLimiter.reset()
    vi.mocked(sendResetEmail).mockReset()
    vi.mocked(sendResetEmail).mockResolvedValue({ status: 'sent' })
    requestFrom('203.0.113.9')
  })

  it('answers the same for a registered and an unknown address', async () => {
    await expect(requestPasswordReset({ email: 'Anna.K@Example.fi' })).resolves.toEqual({
      ok: true,
      data: { sent: true },
    })
    vi.mocked(sendResetEmail).mockResolvedValue({ status: 'skipped' })
    await expect(requestPasswordReset({ email: 'nobody@example.fi' })).resolves.toEqual({
      ok: true,
      data: { sent: true },
    })
    expect(vi.mocked(sendResetEmail).mock.calls.map((c) => c[1])).toEqual([
      'anna.k@example.fi',
      'nobody@example.fi',
    ])
  })

  it('refuses an unusable address before touching Payload', async () => {
    await expect(requestPasswordReset({ email: 'anna' })).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: fi.auth.forgotPassword.errors.emailInvalid },
    })
    expect(sendResetEmail).not.toHaveBeenCalled()
  })

  it('refuses the sixth call from one address within the hour (5/h/IP) and keeps other addresses open', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(requestPasswordReset({ email: 'anna.k@example.fi' })).resolves.toMatchObject({
        ok: true,
      })
    }
    await expect(requestPasswordReset({ email: 'anna.k@example.fi' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: publicMessages.rate_limited,
        retryAfterSeconds: 3600,
      },
    })
    expect(sendResetEmail).toHaveBeenCalledTimes(5)
    requestFrom('203.0.113.10')
    await expect(requestPasswordReset({ email: 'anna.k@example.fi' })).resolves.toMatchObject({
      ok: true,
    })
  })

  it('maps an unexpected failure to the generic error', async () => {
    vi.mocked(sendResetEmail).mockRejectedValue(new Error('smtp down'))
    await expect(requestPasswordReset({ email: 'anna.k@example.fi' })).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: publicMessages.internal },
    })
  })
})

describe('resetPassword action', () => {
  const valid = { token: 'tok', password: PASSWORD, confirmPassword: PASSWORD }

  beforeEach(() => {
    vi.mocked(resetUserPassword).mockReset()
  })

  it('returns field errors for unusable input without touching Payload', async () => {
    await expect(
      resetPassword({ token: '', password: 'lyhyt', confirmPassword: 'muu' }),
    ).resolves.toEqual({
      ok: false,
      fieldErrors: {
        token: fi.auth.resetPassword.errors.tokenMissing,
        password: fi.auth.resetPassword.errors.passwordTooShort,
        confirmPassword: fi.auth.resetPassword.errors.passwordMismatch,
      },
    })
    expect(resetUserPassword).not.toHaveBeenCalled()
  })

  it('passes a weak password back as a field error and a dead token as `invalid`', async () => {
    const weak = { password: fi.auth.resetPassword.errors.passwordTooWeak }
    vi.mocked(resetUserPassword).mockResolvedValueOnce({ status: 'weak', fieldErrors: weak })
    await expect(resetPassword(valid)).resolves.toEqual({ ok: false, fieldErrors: weak })
    vi.mocked(resetUserPassword).mockResolvedValueOnce({ status: 'invalid' })
    await expect(resetPassword(valid)).resolves.toEqual({ ok: false, invalid: true })
    expect(resetUserPassword).toHaveBeenCalledWith({}, { token: 'tok', password: PASSWORD })
  })

  it('redirects to the login banner after a reset', async () => {
    vi.mocked(resetUserPassword).mockResolvedValue({ status: 'reset', email: 'anna.k@example.fi' })
    await expect(resetPassword(valid)).rejects.toMatchObject({
      digest: expect.stringContaining(AFTER_RESET_PATH),
    })
  })

  it('maps an unexpected failure to the generic error', async () => {
    vi.mocked(resetUserPassword).mockRejectedValue(new Error('database down'))
    await expect(resetPassword(valid)).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: publicMessages.internal },
    })
  })
})
