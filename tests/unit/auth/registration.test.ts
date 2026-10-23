import { headers } from 'next/headers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { register } from '@/app/(frontend)/(auth)/rekisteroidy/actions'
import type * as Registration from '@/lib/auth/registration'
import { VERIFY_EMAIL_SUBJECT, renderVerifyEmail, verifyEmailUrl } from '@/emails/VerifyEmail'
import { fi } from '@/i18n/fi'
import { registerUser, validateRegistration, verifyEmailPath } from '@/lib/auth/registration'
import { passwordUserInputs, registrationFormSchema } from '@/lib/auth/registration-schema'
import { env } from '@/lib/env'
import { clientIp } from '@/lib/privacy/ip'
import { TOO_MANY_REQUESTS_PATH, authRateLimiter } from '@/lib/rate-limit'

// The `register` action is exercised without a request context: `headers()` is stubbed per
// test, Payload is never booted and `registerUser` is a spy; `redirect()` is the real one
// (it throws the `NEXT_REDIRECT` digest that carries the target path).
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/auth/registration', async (importOriginal) => ({
  ...(await importOriginal<typeof Registration>()),
  registerUser: vi.fn(),
}))

const valid = {
  email: 'Anna.K@Example.fi',
  password: 'kuusi-metsa-jarvi-2026',
  confirmPassword: 'kuusi-metsa-jarvi-2026',
  acceptTerms: true,
  marketing: false,
}

/** MV-042: registration schema, server validation, rate limiter, verify email. */
describe('registration schema', () => {
  it('accepts a complete form and normalises the email', () => {
    const result = registrationFormSchema.safeParse(valid)
    expect(result.success).toBe(true)
    expect(result.data?.email).toBe('anna.k@example.fi')
  })

  it.each([
    ['invalid email', { email: 'not-an-email' }, 'email', 'Anna kelvollinen sähköpostiosoite'],
    [
      'short password',
      { password: 'lyhyt', confirmPassword: 'lyhyt' },
      'password',
      'Salasanan on oltava vähintään 10 merkkiä',
    ],
    [
      'mismatch',
      { confirmPassword: 'jotain-muuta-2026' },
      'confirmPassword',
      'Salasanat eivät täsmää.',
    ],
    [
      'terms not accepted',
      { acceptTerms: false },
      'acceptTerms',
      'Hyväksy käyttöehdot ja tietosuojaseloste jatkaaksesi',
    ],
  ])('rejects %s on the right field', (_name, overrides, field, message) => {
    const result = registrationFormSchema.safeParse({ ...valid, ...overrides })
    expect(result.success).toBe(false)
    const issue = result.error!.issues.find((i) => i.path[0] === field)
    expect(issue?.message).toBe(message)
  })
})

describe('validateRegistration', () => {
  it('returns the parsed data for a strong password', () => {
    const result = validateRegistration({ ...valid, marketing: true })
    expect(result).toEqual({
      success: true,
      data: { ...valid, email: 'anna.k@example.fi', marketing: true },
    })
  })

  it('maps schema issues to one message per field', () => {
    const result = validateRegistration({ ...valid, email: 'nope', acceptTerms: false })
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        email: 'Anna kelvollinen sähköpostiosoite',
        acceptTerms: 'Hyväksy käyttöehdot ja tietosuojaseloste jatkaaksesi',
      },
    })
  })

  it('rejects a long but guessable password (zxcvbn < 3)', () => {
    const result = validateRegistration({
      ...valid,
      password: 'password12',
      confirmPassword: 'password12',
    })
    expect(result).toEqual({
      success: false,
      fieldErrors: { password: expect.stringContaining('liian heikko') },
    })
  })

  it('penalises the email address inside the password', () => {
    const result = validateRegistration({
      ...valid,
      email: 'kuusimetsajarvi@example.fi',
      password: 'kuusimetsajarvi1',
      confirmPassword: 'kuusimetsajarvi1',
    })
    expect(result.success).toBe(false)
  })

  it('passwordUserInputs yields the address and its local part', () => {
    expect(passwordUserInputs(' Anna.K@Example.fi ')).toEqual(['anna.k@example.fi', 'anna.k'])
    expect(passwordUserInputs('')).toEqual([])
    expect(passwordUserInputs('nolocal')).toEqual(['nolocal'])
  })

  it('rejects non-object input', () => {
    expect(validateRegistration(null).success).toBe(false)
    expect(validateRegistration('x').success).toBe(false)
  })
})

describe('register action', () => {
  const VERIFY_PATH = '/vahvista-sahkoposti?email=anna.k%40example.fi'

  function requestFrom(ip: string) {
    vi.mocked(headers).mockResolvedValue(
      new Headers({ 'x-forwarded-for': ip, 'user-agent': 'vitest' }) as never,
    )
  }

  beforeEach(async () => {
    await authRateLimiter.reset()
    vi.mocked(registerUser).mockReset()
    requestFrom('203.0.113.9')
  })

  it('sends the sixth call from one address within the hour (5/h/IP) to /liikaa-pyyntoja and keeps other addresses open', async () => {
    // `.env.test` runs the suite at the production default so every layer observes the real limit.
    expect(env.AUTH_RATE_LIMIT_PER_HOUR).toBe(5)
    for (let i = 0; i < 5; i += 1) {
      // Invalid input still counts: the limit is applied before validation.
      await expect(register({})).resolves.toMatchObject({ ok: false, fieldErrors: {} })
    }
    await expect(register(valid)).rejects.toMatchObject({
      digest: expect.stringContaining(`;${TOO_MANY_REQUESTS_PATH};`),
    })
    expect(registerUser).not.toHaveBeenCalled()

    requestFrom('203.0.113.10')
    vi.mocked(registerUser).mockResolvedValue({ status: 'created', user: {} as never })
    await expect(register(valid)).rejects.toMatchObject({
      digest: expect.stringContaining(VERIFY_PATH),
    })
    expect(registerUser).toHaveBeenCalledTimes(1)
  })

  it('redirects a duplicate address exactly like a new account', async () => {
    vi.mocked(registerUser).mockResolvedValue({ status: 'duplicate' })
    await expect(register(valid)).rejects.toMatchObject({
      digest: expect.stringContaining(VERIFY_PATH),
    })
    vi.mocked(registerUser).mockResolvedValue({ status: 'created', user: {} as never })
    await expect(register(valid)).rejects.toMatchObject({
      digest: expect.stringContaining(VERIFY_PATH),
    })
    expect(registerUser).toHaveBeenCalledTimes(2)
    expect(vi.mocked(registerUser).mock.calls[0]![1]).toMatchObject({ email: 'anna.k@example.fi' })
    expect(vi.mocked(registerUser).mock.calls[0]![2]).toEqual({
      ip: '203.0.113.9',
      userAgent: 'vitest',
    })
  })

  it('re-validates on the server: a weak password never reaches registerUser', async () => {
    await expect(
      register({ ...valid, password: 'salasana123', confirmPassword: 'salasana123' }),
    ).resolves.toEqual({
      ok: false,
      fieldErrors: { password: fi.auth.register.errors.passwordTooWeak },
    })
    expect(registerUser).not.toHaveBeenCalled()
  })
})

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry, then x-real-ip, and ignores garbage', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    )
    expect(clientIp(new Headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1')
    expect(
      clientIp(new Headers({ 'x-forwarded-for': 'unknown', 'x-real-ip': '198.51.100.2' })),
    ).toBe('198.51.100.2')
    expect(clientIp(new Headers({ 'x-forwarded-for': '<script>' }))).toBeNull()
    expect(clientIp(new Headers())).toBeNull()
  })
})

describe('verify email', () => {
  it('renders template 1 with the token link, the fallback URL and the attribution', async () => {
    const { html, text } = await renderVerifyEmail({
      token: 'abc/123',
      baseUrl: 'https://metsavahti.fi',
      attribution: 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 09/2026',
    })
    expect(VERIFY_EMAIL_SUBJECT).toBe('Vahvista sähköpostiosoitteesi')
    expect(verifyEmailUrl('https://metsavahti.fi', 'abc/123')).toBe(
      'https://metsavahti.fi/vahvista?token=abc%2F123',
    )
    expect(html).toContain('Vahvista sähköpostiosoitteesi')
    expect(html).toContain('Tervetuloa')
    expect(html).toContain('https://metsavahti.fi/vahvista?token=abc%2F123')
    expect(html).toContain('Jos painike ei toimi')
    expect(html).toContain('Jos et luonut tiliä Metsävahtiin')
    expect(html).toContain('Metsänkäyttöilmoitukset-aineistoa 09/2026')
    expect(text).toContain('https://metsavahti.fi/vahvista?token=abc%2F123')
  })

  it('verifyEmailPath encodes the address', () => {
    expect(verifyEmailPath('anna+k@example.fi')).toBe(
      '/vahvista-sahkoposti?email=anna%2Bk%40example.fi',
    )
  })
})
