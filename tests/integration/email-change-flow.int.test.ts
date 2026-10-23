import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  EMAIL_CHANGE_TTL_SECONDS,
  applyEmailChange,
  emailChangeLimiter,
  requestEmailChange,
} from '@/lib/account/email-change'
import { loginUser } from '@/lib/auth/login'
import { env } from '@/lib/env'
import { signToken } from '@/lib/tokens'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

/** Request headers a browser would send with the session cookie on a direct navigation. */
function withCookie(token: string): Headers {
  return new Headers({ cookie: `payload-token=${token}`, 'sec-fetch-site': 'none' })
}

async function readUser(id: number) {
  const payload = await getTestPayload()
  return payload.findByID({ collection: 'users', id, overrideAccess: true, showHiddenFields: true })
}

const CONFIRM = 'Vahvista uusi sähköpostiosoite'
const NOTICE = 'Sähköpostiosoitteen vaihtoa pyydettiin'

let seq = 0
function newAddress(): string {
  seq += 1
  return `uusi${seq}-${Date.now()}@metsavahti.test`
}

/**
 * MV-052: the email change flow against a real Payload + Mailpit. A request stores the pending
 * address and sends the confirmation link to it and the notice to the current address; the
 * link applies the change once (reuse, a replaced link, an expired one and a forged one are
 * rejected); an address that belongs to another account never gets a link.
 */
describe('email change flow (MV-052)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)

  /**
   * The messages with `subject` sent to `address`, newest first, once `count` have arrived
   * (creating an account also sends it `VerifyEmail`, which these tests ignore).
   */
  async function messagesTo(address: string, subject: string, count: number) {
    const deadline = Date.now() + 10_000
    for (;;) {
      const messages = (await mailpit.listMessages()).filter(
        (m) => m.To[0]?.Address === address && m.Subject === subject,
      )
      if (messages.length >= count || Date.now() > deadline) {
        expect(messages).toHaveLength(count)
        const sorted = messages.sort((a, b) => b.Created.localeCompare(a.Created))
        return Promise.all(sorted.map((m) => mailpit.getMessage(m.ID)))
      }
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  /** The token of the newest confirmation link sent to `address`. */
  async function confirmationToken(address: string, count = 1): Promise<string> {
    const [newest] = await messagesTo(address, CONFIRM, count)
    const link = mailpit.extractFirstLink(newest!.HTML, '/vaihda-sahkoposti/vahvista?token=')
    expect(link).toBeTruthy()
    return new URL(link!).searchParams.get('token')!
  }

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    await createTestUser(payload, { role: 'admin' })
  })

  beforeEach(async () => {
    await emailChangeLimiter.reset()
  })

  it('stores the pending address, mails the link to it and the notice to the current one', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const next = newAddress()

    await expect(requestEmailChange(payload, user, next)).resolves.toEqual({
      status: 'requested',
      pendingEmail: next,
    })

    const stored = await readUser(user.id)
    expect(stored.email).toBe(user.email)
    expect(stored.pendingEmail).toBe(next)
    expect(stored.pendingEmailTokenId).toMatch(/^[0-9a-f-]{36}$/)

    const [confirm] = await messagesTo(next, CONFIRM, 1)
    expect(confirm!.Subject).toBe('Vahvista uusi sähköpostiosoite')
    expect(confirm!.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
    const link = mailpit.extractFirstLink(confirm!.HTML, '/vaihda-sahkoposti/vahvista?token=')
    expect(
      link?.startsWith(`${env.NEXT_PUBLIC_SERVER_URL}/vaihda-sahkoposti/vahvista?token=`),
    ).toBe(true)

    const [notice] = await messagesTo(user.email, NOTICE, 1)
    expect(notice!.Subject).toBe('Sähköpostiosoitteen vaihtoa pyydettiin')
    expect(notice!.HTML).toContain(next)
    expect(notice!.HTML).not.toContain('vaihda-sahkoposti')
    expect(notice!.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')

    // Asking for the address the account already has does nothing.
    await expect(requestEmailChange(payload, user, user.email)).resolves.toEqual({
      status: 'same',
    })
  })

  it('applies the change once: the address is verified, the session survives, the token reuse is rejected', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const session = await loginUser(payload, {
      email: user.email,
      password: user.password,
      remember: false,
    })
    if (session.status !== 'ok') throw new Error('login failed')
    // A reset link sent to the old address must stop working with it.
    await payload.forgotPassword({
      collection: 'users',
      data: { email: user.email },
      overrideAccess: true,
      disableEmail: true,
    })
    const next = newAddress()
    await requestEmailChange(payload, user, next)
    const token = await confirmationToken(next)

    await expect(applyEmailChange(payload, token)).resolves.toEqual({
      state: 'changed',
      email: next,
    })
    const after = await readUser(user.id)
    expect(after.email).toBe(next)
    expect(after._verified).toBe(true)
    expect(after.pendingEmail ?? null).toBeNull()
    expect(after.pendingEmailTokenId ?? null).toBeNull()
    expect(after.resetPasswordToken ?? null).toBeNull()

    // Token reuse rejected: the same link changes nothing the second time.
    await expect(applyEmailChange(payload, token)).resolves.toEqual({ state: 'invalid' })

    // The session that asked is still valid; logins use the new address only.
    await expect(payload.auth({ headers: withCookie(session.token) })).resolves.toMatchObject({
      user: { id: user.id, email: next },
    })
    await expect(
      loginUser(payload, { email: next, password: user.password, remember: false }),
    ).resolves.toMatchObject({ status: 'ok', user: { id: user.id } })
    await expect(
      loginUser(payload, { email: user.email, password: user.password, remember: false }),
    ).resolves.toEqual({ status: 'invalid' })
  })

  it('accepts only the newest link, and none after an hour', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const first = newAddress()
    const second = newAddress()
    await requestEmailChange(payload, user, first)
    const replaced = await confirmationToken(first)
    await requestEmailChange(payload, user, second)
    const newest = await confirmationToken(second)

    // The first request was replaced: its link no longer applies anything.
    await expect(applyEmailChange(payload, replaced)).resolves.toEqual({ state: 'invalid' })
    expect((await readUser(user.id)).email).toBe(user.email)

    // An hour later the newest link has expired too.
    const later = new Date(Date.now() + (EMAIL_CHANGE_TTL_SECONDS + 5) * 1000)
    await expect(applyEmailChange(payload, newest, later)).resolves.toEqual({ state: 'invalid' })
    expect((await readUser(user.id)).email).toBe(user.email)
    await expect(applyEmailChange(payload, newest)).resolves.toMatchObject({ state: 'changed' })
  })

  it('rejects made-up tokens and a validly signed one whose jti was never stored', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const next = newAddress()
    await requestEmailChange(payload, user, next)

    await expect(applyEmailChange(payload, undefined)).resolves.toEqual({ state: 'invalid' })
    await expect(applyEmailChange(payload, 'nonsense')).resolves.toEqual({ state: 'invalid' })
    const forged = await signToken(
      'email-change',
      { sub: String(user.id), jti: 'guessed', email: next },
      EMAIL_CHANGE_TTL_SECONDS,
    )
    await expect(applyEmailChange(payload, forged)).resolves.toEqual({ state: 'invalid' })
    expect((await readUser(user.id)).email).toBe(user.email)
  })

  it('sends no link to an address with an account, and refuses one taken after the link was sent', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const other = await createTestUser(payload)

    // Same answer and the same notice as for a free address, but no link reaches the other account.
    await expect(requestEmailChange(payload, user, other.email)).resolves.toEqual({
      status: 'requested',
      pendingEmail: other.email,
    })
    await messagesTo(user.email, NOTICE, 1)
    expect(
      (await mailpit.listMessages()).filter(
        (m) => m.To[0]?.Address === other.email && m.Subject === CONFIRM,
      ),
    ).toHaveLength(0)

    // A free address gets its link, then someone registers it before the link is opened.
    const next = newAddress()
    await requestEmailChange(payload, user, next)
    const token = await confirmationToken(next)
    await createTestUser(payload, { email: next })
    await expect(applyEmailChange(payload, token)).resolves.toEqual({ state: 'taken' })
    const after = await readUser(user.id)
    expect(after.email).toBe(user.email)
    expect(after.pendingEmail ?? null).toBeNull()
  })

  it('allows three requests per hour per account', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    for (let i = 0; i < 3; i += 1) {
      await expect(requestEmailChange(payload, user, newAddress())).resolves.toMatchObject({
        status: 'requested',
      })
    }
    await expect(requestEmailChange(payload, user, newAddress())).resolves.toMatchObject({
      status: 'limited',
    })
  })

  it('keeps the pending fields out of reach of the account itself', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { pendingEmail: 'itse@metsavahti.test', pendingEmailTokenId: 'mine' },
      overrideAccess: false,
      user,
    })
    const after = await readUser(user.id)
    expect(after.pendingEmail ?? null).toBeNull()
    expect(after.pendingEmailTokenId ?? null).toBeNull()
  })
})
