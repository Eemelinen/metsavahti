import { describe, expect, it } from 'vitest'

import { fi } from '@/i18n/fi'
import { changePasswordFormSchema, profileFormSchema } from '@/lib/account/account-schema'
import { formatSessionTime } from '@/lib/account/sessions'
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  isValidTimeZone,
  timezoneOptions,
} from '@/lib/account/timezone'
import { UNKNOWN_BROWSER, describeUserAgent } from '@/lib/account/user-agent'

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  edgeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
}

/** MV-051: the pure parts of `/tili` and `/tili/turvallisuus`. */
describe('profile and security pages (MV-051)', () => {
  describe('describeUserAgent', () => {
    it('names the browser and the system the way the artboard does', () => {
      expect(describeUserAgent(UA.chromeWindows)).toBe('Chrome, Windows')
      expect(describeUserAgent(UA.safariIphone)).toBe('Safari, iPhone')
      expect(describeUserAgent(UA.firefoxLinux)).toBe('Firefox, Linux')
      // Edge also claims Chrome and Safari; Android also claims Linux.
      expect(describeUserAgent(UA.edgeMac)).toBe('Edge, macOS')
      expect(describeUserAgent(UA.chromeAndroid)).toBe('Chrome, Android')
    })

    it('falls back for missing or unknown agents', () => {
      expect(describeUserAgent(null)).toBe(UNKNOWN_BROWSER)
      expect(describeUserAgent('')).toBe(UNKNOWN_BROWSER)
      expect(describeUserAgent('curl/8.5.0')).toBe(UNKNOWN_BROWSER)
      expect(describeUserAgent('SomeBot/1.0 (Windows)')).toBe(`${UNKNOWN_BROWSER}, Windows`)
    })
  })

  describe('profileFormSchema', () => {
    it('accepts a profile, trims the name and allows an empty one', () => {
      expect(
        profileFormSchema.parse({ name: '  Anna Korhonen ', locale: 'en', timezone: 'UTC' }),
      ).toEqual({ name: 'Anna Korhonen', locale: 'en', timezone: 'UTC' })
      expect(
        profileFormSchema.parse({ name: '', locale: 'fi', timezone: DEFAULT_TIMEZONE }).name,
      ).toBe('')
    })

    it('rejects a long name, an unknown language and an unknown zone with Finnish messages', () => {
      const result = profileFormSchema.safeParse({
        name: 'x'.repeat(101),
        locale: 'sv',
        timezone: 'Mars/Olympus_Mons',
      })
      expect(result.success).toBe(false)
      const messages = Object.fromEntries(
        result.error!.issues.map((issue) => [issue.path[0], issue.message]),
      )
      expect(messages).toEqual({
        name: fi.account.profile.errors.nameTooLong,
        locale: fi.account.profile.errors.localeInvalid,
        timezone: fi.account.profile.errors.timezoneInvalid,
      })
    })
  })

  describe('changePasswordFormSchema', () => {
    it('requires the current password and a new one of at least 10 characters', () => {
      const result = changePasswordFormSchema.safeParse({
        currentPassword: '',
        newPassword: 'short',
      })
      expect(result.success).toBe(false)
      expect(result.error!.issues.map((issue) => issue.message)).toEqual([
        fi.account.password.errors.currentMissing,
        fi.account.password.errors.passwordTooShort,
      ])
    })

    it('refuses a new password equal to the current one', () => {
      const result = changePasswordFormSchema.safeParse({
        currentPassword: 'kuusi-metsa-jarvi-2026',
        newPassword: 'kuusi-metsa-jarvi-2026',
      })
      expect(result.success).toBe(false)
      expect(result.error!.issues[0]).toMatchObject({
        path: ['newPassword'],
        message: fi.account.password.errors.sameAsCurrent,
      })
    })
  })

  describe('time zones', () => {
    it('offers Helsinki first and only valid zones', () => {
      expect(TIMEZONE_OPTIONS[0]).toBe(DEFAULT_TIMEZONE)
      expect(TIMEZONE_OPTIONS.every(isValidTimeZone)).toBe(true)
    })

    it("adds the account's own zone when it is not on the list, and nothing invalid", () => {
      expect(timezoneOptions('Europe/Helsinki')).toEqual([...TIMEZONE_OPTIONS])
      expect(timezoneOptions(null)).toEqual([...TIMEZONE_OPTIONS])
      expect(timezoneOptions('America/New_York')).toEqual(['America/New_York', ...TIMEZONE_OPTIONS])
      expect(timezoneOptions('Mars/Olympus_Mons')).toEqual([...TIMEZONE_OPTIONS])
    })
  })

  it('formats session times in the account time zone', () => {
    expect(formatSessionTime('2026-09-02T11:05:00Z', 'Europe/Helsinki')).toBe('2.9.2026 klo 14.05')
    expect(formatSessionTime('2026-09-02T11:05:00Z', 'UTC')).toBe('2.9.2026 klo 11.05')
  })
})
