import { Forbidden } from 'payload'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { fi } from '@/i18n/fi'
import {
  changeUserPassword,
  passwordChangeLimiter,
  verifyPassword,
} from '@/lib/account/password-change'
import { updateUserProfile } from '@/lib/account/profile'
import {
  LAST_SEEN_INTERVAL_MS,
  currentSessionId,
  endOtherSessions,
  listUserSessions,
  recordSessionSeen,
} from '@/lib/account/sessions'
import { loginUser } from '@/lib/auth/login'
import { readSessionToken } from '@/lib/auth/session'
import type { User } from '@/payload-types'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

const NEW_PASSWORD = 'kuusi-metsa-jarvi-2026'
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** Request headers a browser would send with the session cookie on a direct navigation. */
function withCookie(token: string): Headers {
  return new Headers({ cookie: `payload-token=${token}`, 'sec-fetch-site': 'none' })
}

/** Log `user` in and return the token and its session id. */
async function logIn(user: { email: string; password: string }) {
  const payload = await getTestPayload()
  const outcome = await loginUser(payload, {
    email: user.email,
    password: user.password,
    remember: false,
  })
  if (outcome.status !== 'ok') throw new Error(`login failed: ${outcome.status}`)
  const sid = readSessionToken(outcome.token, payload.secret)?.sid
  if (!sid) throw new Error('token without a session id')
  return { token: outcome.token, sid }
}

async function authenticatedId(token: string): Promise<number | null> {
  const payload = await getTestPayload()
  const { user } = await payload.auth({ headers: withCookie(token) })
  return user ? Number(user.id) : null
}

async function readUser(id: number): Promise<User> {
  const payload = await getTestPayload()
  return payload.findByID({ collection: 'users', id, overrideAccess: true, showHiddenFields: true })
}

/**
 * MV-051 against a real Payload: profile edits and session data are the owner's alone, a
 * password change needs the current password and ends every other session, and the device
 * list follows `users.sessions`.
 */
describe('profile and security pages (MV-051)', () => {
  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    // The first account becomes admin (Users hook); the tests' accounts come after it.
    await createTestUser(payload, { role: 'admin' })
  })

  afterEach(async () => {
    await passwordChangeLimiter.reset()
  })

  describe('owner-only', () => {
    it("updateUserProfile changes the signed-in user's row and no other", async () => {
      const payload = await getTestPayload()
      const owner = await createTestUser(payload, { name: 'Anna Korhonen' })
      const other = await createTestUser(payload, { name: 'Pekka Puu' })

      const saved = await updateUserProfile(payload, owner, {
        name: 'Anna K.',
        locale: 'en',
        timezone: 'Europe/Stockholm',
      })
      expect(saved).toMatchObject({ name: 'Anna K.', locale: 'en', timezone: 'Europe/Stockholm' })
      expect(await readUser(owner.id)).toMatchObject({ name: 'Anna K.', locale: 'en' })
      expect(await readUser(other.id)).toMatchObject({
        name: 'Pekka Puu',
        locale: 'fi',
        timezone: 'Europe/Helsinki',
      })

      // An empty name clears it.
      await updateUserProfile(payload, owner, { name: '', locale: 'fi', timezone: 'UTC' })
      expect((await readUser(owner.id)).name).toBeNull()

      // The write runs as the user, so `users` access (`isAdminOrSelf`) refuses another account.
      await expect(
        payload.update({
          collection: 'users',
          id: other.id,
          data: { name: 'Hijacked' },
          overrideAccess: false,
          user: owner,
        }),
      ).rejects.toBeInstanceOf(Forbidden)
      expect((await readUser(other.id)).name).toBe('Pekka Puu')
    })

    it("lists only the owner's sessions and keeps session rows from other users", async () => {
      const payload = await getTestPayload()
      const owner = await createTestUser(payload)
      const other = await createTestUser(payload)
      const mine = await logIn(owner)
      const theirs = await logIn(other)
      await recordSessionSeen(payload, { user: owner, sid: mine.sid, userAgent: CHROME })
      await recordSessionSeen(payload, { user: other, sid: theirs.sid, userAgent: SAFARI })

      const listed = await listUserSessions(payload, owner, mine.sid)
      expect(listed.map((s) => s.id)).toEqual([mine.sid])
      // Listing the owner's sessions never prunes another user's rows.
      const { totalDocs } = await payload.count({
        collection: 'user-sessions',
        where: { sid: { equals: theirs.sid } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(1)

      // The collection itself is admin-only: a user cannot read anyone's rows through the API.
      await expect(
        payload.find({ collection: 'user-sessions', overrideAccess: false, user: owner }),
      ).rejects.toBeInstanceOf(Forbidden)
      // Ending "other sessions" of one account leaves the other account signed in.
      await endOtherSessions(payload, owner, mine.sid)
      expect(await authenticatedId(theirs.token)).toBe(other.id)
    })
  })

  describe('change password', () => {
    it('needs the current password, ends every other session and keeps this one', async () => {
      const payload = await getTestPayload()
      const user = await createTestUser(payload)
      const here = await logIn(user)
      const laptop = await logIn(user)
      const phone = await logIn(user)
      expect(await authenticatedId(laptop.token)).toBe(user.id)

      const wrong = await changeUserPassword(payload, user, here.sid, {
        currentPassword: 'not-the-password-1',
        newPassword: NEW_PASSWORD,
      })
      expect(wrong).toEqual({
        status: 'rejected',
        fieldErrors: { currentPassword: fi.account.password.errors.currentWrong },
      })
      // A refusal changes nothing.
      expect(await authenticatedId(laptop.token)).toBe(user.id)

      const weak = await changeUserPassword(payload, user, here.sid, {
        currentPassword: user.password,
        newPassword: 'aaaaaaaaaaaa',
      })
      expect(weak).toEqual({
        status: 'rejected',
        fieldErrors: { newPassword: fi.account.password.errors.passwordTooWeak },
      })

      const changed = await changeUserPassword(payload, user, here.sid, {
        currentPassword: user.password,
        newPassword: NEW_PASSWORD,
      })
      expect(changed).toEqual({ status: 'changed', endedSessions: 2 })

      // The other sessions are invalid at once; the one that asked is still signed in.
      expect(await authenticatedId(laptop.token)).toBeNull()
      expect(await authenticatedId(phone.token)).toBeNull()
      expect(await authenticatedId(here.token)).toBe(user.id)
      expect((await readUser(user.id)).sessions?.map((s) => s.id)).toEqual([here.sid])

      // The new password logs in, the old one does not.
      const stored = await readUser(user.id)
      expect(await verifyPassword(stored, NEW_PASSWORD)).toBe(true)
      expect(await verifyPassword(stored, user.password)).toBe(false)
      expect(
        (await loginUser(payload, { email: user.email, password: user.password, remember: false }))
          .status,
      ).toBe('invalid')
      expect(
        (await loginUser(payload, { email: user.email, password: NEW_PASSWORD, remember: false }))
          .status,
      ).toBe('ok')
    })

    it('verifyPassword agrees with the hash Payload stored at creation', async () => {
      const payload = await getTestPayload()
      const user = await createTestUser(payload)
      const stored = await readUser(user.id)
      expect(await verifyPassword(stored, user.password)).toBe(true)
      expect(await verifyPassword(stored, `${user.password}x`)).toBe(false)
      expect(await verifyPassword({ hash: null, salt: null }, user.password)).toBe(false)
    })

    it('allows five attempts per 15 minutes', async () => {
      const payload = await getTestPayload()
      const user = await createTestUser(payload)
      const attempt = () =>
        changeUserPassword(payload, user, null, {
          currentPassword: 'not-the-password-1',
          newPassword: NEW_PASSWORD,
        })
      for (let i = 0; i < 5; i += 1) expect((await attempt()).status).toBe('rejected')
      expect(await attempt()).toMatchObject({ status: 'limited' })
    })
  })

  describe('sessions list', () => {
    it('records the browser once and moves last-seen forward at most every five minutes', async () => {
      const payload = await getTestPayload()
      const user = await createTestUser(payload)
      const { sid } = await logIn(user)
      const t0 = Date.now()

      await recordSessionSeen(payload, { user, sid, userAgent: CHROME, now: t0 })
      // Later requests within the interval write nothing, and the first browser is kept.
      await recordSessionSeen(payload, { user, sid, userAgent: CHROME, now: t0 })
      await recordSessionSeen(payload, { user, sid, userAgent: SAFARI, now: t0 + 60_000 })
      const row = async () =>
        (
          await payload.find({
            collection: 'user-sessions',
            where: { sid: { equals: sid } },
            overrideAccess: true,
          })
        ).docs
      expect(await row()).toHaveLength(1)
      expect((await row())[0]).toMatchObject({
        userAgent: CHROME,
        lastSeenAt: new Date(t0).toISOString(),
      })

      const later = t0 + LAST_SEEN_INTERVAL_MS + 1_000
      await recordSessionSeen(payload, { user, sid, userAgent: CHROME, now: later })
      expect((await row())[0]!.lastSeenAt).toBe(new Date(later).toISOString())
    })

    it('lists live sessions with device, times and the current flag, and prunes ended ones', async () => {
      const payload = await getTestPayload()
      const user = await createTestUser(payload)
      const desktop = await logIn(user)
      const phone = await logIn(user)
      const unseen = await logIn(user)
      await recordSessionSeen(payload, { user, sid: desktop.sid, userAgent: CHROME })
      await recordSessionSeen(payload, { user, sid: phone.sid, userAgent: SAFARI })

      const listed = await listUserSessions(payload, user, phone.sid)
      expect(listed).toHaveLength(3)
      expect(listed[0]).toMatchObject({
        id: phone.sid,
        device: 'Safari, iPhone',
        current: true,
        activeNow: true,
      })
      expect(listed.find((s) => s.id === desktop.sid)).toMatchObject({
        device: 'Chrome, Windows',
        current: false,
        activeNow: true,
      })
      // A session seen by no page yet (logged in through the REST API, say) is still listed.
      expect(listed.find((s) => s.id === unseen.sid)).toMatchObject({
        device: 'Tuntematon selain',
        current: false,
      })
      for (const item of listed) expect(item.createdAt).toBeTruthy()

      // "Kirjaa ulos muista laitteista": only the current session survives, rows included.
      expect(await endOtherSessions(payload, user, phone.sid)).toBe(2)
      expect(await authenticatedId(desktop.token)).toBeNull()
      expect(await authenticatedId(phone.token)).toBe(user.id)
      expect((await listUserSessions(payload, user, phone.sid)).map((s) => s.id)).toEqual([
        phone.sid,
      ])
      const { docs } = await payload.find({
        collection: 'user-sessions',
        where: { user: { equals: user.id } },
        overrideAccess: true,
      })
      expect(docs.map((d) => d.sid)).toEqual([phone.sid])
    })

    it('drops the rows of sessions that ended elsewhere when the list is read', async () => {
      const payload = await getTestPayload()
      const user = await createTestUser(payload)
      const kept = await logIn(user)
      const ended = await logIn(user)
      await recordSessionSeen(payload, { user, sid: ended.sid, userAgent: CHROME })
      // The session ends without the list's help (a logout on that device).
      await payload.db.updateOne({
        id: user.id,
        collection: 'users',
        data: { sessions: (await readUser(user.id)).sessions?.filter((s) => s.id === kept.sid) },
        returning: false,
      })

      expect((await listUserSessions(payload, user, kept.sid)).map((s) => s.id)).toEqual([kept.sid])
      const { totalDocs } = await payload.count({
        collection: 'user-sessions',
        where: { sid: { equals: ended.sid } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(0)
    })

    it("currentSessionId reads the cookie's session id only for its own user", async () => {
      const payload = await getTestPayload()
      const user = await createTestUser(payload)
      const other = await createTestUser(payload)
      const { token, sid } = await logIn(user)
      expect(currentSessionId(payload, withCookie(token), user)).toBe(sid)
      expect(currentSessionId(payload, withCookie(token), other)).toBeNull()
      expect(currentSessionId(payload, new Headers(), user)).toBeNull()
    })
  })
})
