import { SignJWT, decodeJwt } from 'jose'
import { describe, expect, it } from 'vitest'

import {
  CHANGE_EMAIL_SUBJECT,
  changeEmailUrl,
  renderChangeEmailConfirm,
} from '@/emails/ChangeEmailConfirm'
import { EMAIL_CHANGE_NOTICE_SUBJECT, renderEmailChangeNotice } from '@/emails/EmailChangeNotice'
import { fi } from '@/i18n/fi'
import { changeEmailFormSchema } from '@/lib/account/account-schema'
import { signToken, verifyToken } from '@/lib/tokens'

const ATTRIBUTION = 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 10/2026'

/** MV-052: the pure parts of the email change flow (signed links, form schema, both emails). */
describe('email change flow (MV-052)', () => {
  describe('signed tokens', () => {
    const claims = { sub: '42', jti: 'f3a1', email: 'uusi@example.fi' }

    it('verifies its own token for the same purpose and returns the claims', async () => {
      const token = await signToken('email-change', claims, 3600)
      expect(decodeJwt(token)).toMatchObject({ purpose: 'email-change', sub: '42', jti: 'f3a1' })
      await expect(verifyToken('email-change', token)).resolves.toMatchObject({
        ...claims,
        purpose: 'email-change',
        iss: 'metsavahti',
      })
    })

    it('rejects an expired token, a tampered one and one signed with another key', async () => {
      const issued = new Date('2026-10-23T10:00:00Z')
      const token = await signToken('email-change', claims, 3600, issued)
      await expect(
        verifyToken('email-change', token, new Date('2026-10-23T10:59:00Z')),
      ).resolves.not.toBeNull()
      await expect(
        verifyToken('email-change', token, new Date('2026-10-23T11:00:01Z')),
      ).resolves.toBeNull()

      const [header, , signature] = token.split('.')
      const forged = Buffer.from(JSON.stringify({ ...decodeJwt(token), sub: '1' })).toString(
        'base64url',
      )
      await expect(
        verifyToken('email-change', `${header}.${forged}.${signature}`),
      ).resolves.toBeNull()

      const foreign = await new SignJWT({ purpose: 'email-change', email: claims.email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('metsavahti')
        .setSubject('42')
        .setJti('f3a1')
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('some-other-secret-of-at-least-32-chars'))
      await expect(verifyToken('email-change', foreign)).resolves.toBeNull()
      await expect(verifyToken('email-change', 'not-a-token')).resolves.toBeNull()
    })

    it('rejects a token signed for another purpose', async () => {
      const token = await signToken('email-change', claims, 3600)
      // The only purpose so far; a token whose claim says otherwise must not verify.
      await expect(
        verifyToken('unsubscribe' as unknown as 'email-change', token),
      ).resolves.toBeNull()
    })
  })

  describe('changeEmailFormSchema', () => {
    it('lower-cases and trims the address', () => {
      expect(changeEmailFormSchema.parse({ email: 'Anna.K@Example.FI ' })).toEqual({
        email: 'anna.k@example.fi',
      })
    })

    it('rejects something that is not an address with the Finnish message', () => {
      const result = changeEmailFormSchema.safeParse({ email: 'anna@' })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe(fi.account.profile.errors.emailInvalid)
    })
  })

  describe('emails', () => {
    it('renders template 7 to the new address with the confirmation link and the attribution', async () => {
      const { html, text } = await renderChangeEmailConfirm({
        newEmail: 'anna.k@example.fi',
        token: 'abc/123',
        baseUrl: 'https://metsavahti.fi',
        attribution: ATTRIBUTION,
      })
      expect(CHANGE_EMAIL_SUBJECT).toBe('Vahvista uusi sähköpostiosoite')
      expect(changeEmailUrl('https://metsavahti.fi', 'abc/123')).toBe(
        'https://metsavahti.fi/vaihda-sahkoposti/vahvista?token=abc%2F123',
      )
      expect(html).toContain('Turvallisuus')
      expect(html).toContain('Vahvista uusi osoite')
      expect(html).toContain('osoitteeseen anna.k@example.fi')
      expect(html).toContain('https://metsavahti.fi/vaihda-sahkoposti/vahvista?token=abc%2F123')
      expect(html).toContain('Jos painike ei toimi')
      expect(html).toContain('Lähetimme tiedon myös vanhaan osoitteeseen')
      expect(html).toContain('Metsänkäyttöilmoitukset-aineistoa 10/2026')
      expect(text).toContain('https://metsavahti.fi/vaihda-sahkoposti/vahvista?token=abc%2F123')
    })

    it('renders the notice to the old address without any change link', async () => {
      const { html, text } = await renderEmailChangeNotice({
        newEmail: 'anna.k@example.fi',
        baseUrl: 'https://metsavahti.fi',
        attribution: ATTRIBUTION,
      })
      expect(EMAIL_CHANGE_NOTICE_SUBJECT).toBe('Sähköpostiosoitteen vaihtoa pyydettiin')
      expect(html).toContain('osoitteeseen anna.k@example.fi')
      expect(html).toContain('https://metsavahti.fi/tili/turvallisuus')
      expect(html).not.toContain('vaihda-sahkoposti')
      expect(html).toContain('Metsänkäyttöilmoitukset-aineistoa 10/2026')
      expect(text).toContain('Jos et pyytänyt vaihtoa')
    })
  })
})
