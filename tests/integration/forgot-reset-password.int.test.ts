import { beforeAll, describe, expect, it } from 'vitest'

import { loginUser } from '@/lib/auth/login'
import {
  findPasswordResetUser,
  requestPasswordReset,
  resetCooldownLimiter,
  resetUserPassword,
} from '@/lib/auth/password-reset'
import { RESET_LINK_TTL_MS } from '@/lib/auth/password-reset-schema'
import { env } from '@/lib/env'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const NEW_PASSWORD = 'koivu-suo-lampi-2027'

/** Request headers a browser would send with the session cookie on a direct navigation. */
function withCookie(token: string): Headers {
  return new Headers({ cookie: `payload-token=${token}`, 'sec-fetch-site': 'none' })
}

async function readUser(id: number) {
  const payload = await getTestPayload()
  return payload.findByID({ collection: 'users', id, overrideAccess: true, showHiddenFields: true })
}

/** Ask for a reset and return the token Payload stored for the account. */
async function requestToken(email: string, id: number): Promise<string> {
  const payload = await getTestPayload()
  resetCooldownLimiter.reset()
  await expect(requestPasswordReset(payload, email)).resolves.toEqual({ status: 'sent' })
  const token = (await readUser(id)).resetPasswordToken
  expect(token).toBeTruthy()
  return token!
}

/**
 * MV-045: the reset request against a real Payload + Mailpit (neutral for unknown addresses,
 * the email with the `/uusi-salasana?token=` link, the cooldown), the token lookup, and the
 * reset itself: the old session is rejected afterwards, the old password too, the token
 * works once and expires after an hour.
 */
describe('forgot / reset password (MV-045)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await mailpit.deleteAll()
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    await createTestUser(payload, { role: 'admin' })
  })

  it('sends the ResetPassword email with a one-hour token to a registered address and nothing to an unknown one', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    resetCooldownLimiter.reset()
    const before = (await mailpit.listMessages()).length

    await expect(requestPasswordReset(payload, 'nobody@metsavahti.test')).resolves.toEqual({
      status: 'skipped',
    })
    const now = Date.now()
    await expect(requestPasswordReset(payload, user.email)).resolves.toEqual({ status: 'sent' })
    // The same address again within the cooldown: silently skipped, no second email.
    await expect(requestPasswordReset(payload, user.email)).resolves.toEqual({
      status: 'skipped',
    })

    const stored = await readUser(user.id)
    expect(stored.resetPasswordToken).toMatch(/^[0-9a-f]{40}$/)
    const expires = Date.parse(stored.resetPasswordExpiration!) - now
    expect(expires).toBeGreaterThan(RESET_LINK_TTL_MS - 5_000)
    expect(expires).toBeLessThan(RESET_LINK_TTL_MS + 5_000)

    const messages = await mailpit.waitForMessages(before + 1)
    expect(messages).toHaveLength(before + 1)
    const message = await mailpit.getMessage(
      messages.find((m) => m.To[0]?.Address === user.email)!.ID,
    )
    expect(message.Subject).toBe('Salasanan palautus')
    expect(mailpit.extractFirstLink(message.HTML, '/uusi-salasana?token=')).toBe(
      `${env.NEXT_PUBLIC_SERVER_URL}/uusi-salasana?token=${stored.resetPasswordToken}`,
    )
    expect(message.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')

    await expect(findPasswordResetUser(payload, stored.resetPasswordToken!)).resolves.toMatchObject(
      { id: user.id },
    )
    await expect(findPasswordResetUser(payload, undefined)).resolves.toBeNull()
    await expect(findPasswordResetUser(payload, 'nonsense')).resolves.toBeNull()
    // The lookup honours the expiry without touching the row.
    await expect(
      findPasswordResetUser(payload, stored.resetPasswordToken!, now + RESET_LINK_TTL_MS + 5_000),
    ).resolves.toBeNull()
  })

  it('changes the password, rejects the old session and the old password, and unlocks the account', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const session = await loginUser(payload, {
      email: user.email,
      password: user.password,
      remember: true,
    })
    if (session.status !== 'ok') throw new Error('login failed')
    await expect(payload.auth({ headers: withCookie(session.token) })).resolves.toMatchObject({
      user: { id: user.id },
    })
    // A lockout in progress is cleared by the reset.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { loginAttempts: 5, lockUntil: new Date(Date.now() + 600_000).toISOString() },
      overrideAccess: true,
    })
    await expect(
      loginUser(payload, { email: user.email, password: user.password, remember: false }),
    ).resolves.toEqual({ status: 'locked' })

    const token = await requestToken(user.email, user.id)
    await expect(resetUserPassword(payload, { token, password: NEW_PASSWORD })).resolves.toEqual({
      status: 'reset',
      email: user.email,
    })

    // The session from before the reset is dead everywhere, and none replaced it.
    await expect(payload.auth({ headers: withCookie(session.token) })).resolves.toMatchObject({
      user: null,
    })
    const after = await readUser(user.id)
    expect(after.sessions ?? []).toHaveLength(0)
    expect(after.loginAttempts).toBe(0)
    expect(after.lockUntil ?? null).toBeNull()
    expect(after.resetPasswordToken ?? null).toBeNull()

    await expect(
      loginUser(payload, { email: user.email, password: user.password, remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
    await expect(
      loginUser(payload, { email: user.email, password: NEW_PASSWORD, remember: false }),
    ).resolves.toMatchObject({ status: 'ok', user: { id: user.id } })

    // The token worked once.
    await expect(
      resetUserPassword(payload, { token, password: 'vielakin-uudempi-2028' }),
    ).resolves.toEqual({ status: 'invalid' })
  })

  it('refuses an expired token, a made-up one and a weak password', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const token = await requestToken(user.email, user.id)

    // Too guessable for zxcvbn once the address is penalised: nothing changes.
    const local = user.email.split('@')[0]!
    await expect(
      resetUserPassword(payload, { token, password: `${local}${local}` }),
    ).resolves.toMatchObject({ status: 'weak' })
    await expect(findPasswordResetUser(payload, token)).resolves.toMatchObject({ id: user.id })

    await expect(
      resetUserPassword(payload, { token: 'nonsense', password: NEW_PASSWORD }),
    ).resolves.toEqual({ status: 'invalid' })

    // An hour passes: backdate the expiry as time would.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { resetPasswordExpiration: new Date(Date.now() - 1000).toISOString() },
      overrideAccess: true,
    })
    await expect(resetUserPassword(payload, { token, password: NEW_PASSWORD })).resolves.toEqual({
      status: 'invalid',
    })
    await expect(
      loginUser(payload, { email: user.email, password: user.password, remember: false }),
    ).resolves.toMatchObject({ status: 'ok' })
  })
})
