import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { ACCOUNT_DELETED_SUBJECT, renderAccountDeleted } from '@/emails/AccountDeleted'
import { ACCOUNT_TABS } from '@/components/account/account-tabs'
import {
  ACCOUNT_DELETED_PATH,
  deleteAccountFormSchema,
  fieldErrorsOf,
} from '@/lib/account/account-schema'
import { hashEmail } from '@/lib/jobs/delete-account'

const ATTRIBUTION = 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 10/2026'

/** MV-094: the pure parts of account deletion (form rule, address hash, email, tab). */
describe('account deletion (MV-094)', () => {
  describe('deleteAccountFormSchema', () => {
    const errorsOf = (input: unknown) => {
      const parsed = deleteAccountFormSchema.safeParse(input)
      return parsed.success ? {} : fieldErrorsOf<'confirm' | 'password'>(parsed.error)
    }

    it('accepts POISTA with a password and forgives surrounding spaces', () => {
      expect(deleteAccountFormSchema.parse({ confirm: 'POISTA', password: 'x' })).toEqual({
        confirm: 'POISTA',
        password: 'x',
      })
      expect(deleteAccountFormSchema.parse({ confirm: '  POISTA ', password: 'x' }).confirm).toBe(
        'POISTA',
      )
    })

    it('asks for POISTA exactly, in upper case', () => {
      for (const confirm of ['', 'poista', 'Poista', 'POISTA!', 'POIS TA', 'DELETE']) {
        expect(errorsOf({ confirm, password: 'x' })).toEqual({
          confirm: 'Kirjoita POISTA isoin kirjaimin.',
        })
      }
    })

    it('asks for the password, and reports both fields at once', () => {
      expect(errorsOf({ confirm: 'POISTA', password: '' })).toEqual({
        password: 'Anna salasanasi.',
      })
      expect(errorsOf({ confirm: 'nope', password: '' })).toEqual({
        confirm: 'Kirjoita POISTA isoin kirjaimin.',
        password: 'Anna salasanasi.',
      })
      expect(errorsOf({})).toHaveProperty('confirm')
      expect(deleteAccountFormSchema.safeParse(null).success).toBe(false)
    })
  })

  it('hashes the address trimmed and lower-cased with SHA-256', () => {
    const expected = createHash('sha256').update('liisa@example.fi').digest('hex')
    expect(hashEmail('liisa@example.fi')).toBe(expected)
    expect(hashEmail(' Liisa@Example.FI ')).toBe(expected)
    expect(hashEmail('liisa@example.fi')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('lists Poista tili last among the account tabs', () => {
    expect(ACCOUNT_TABS.at(-1)).toEqual({ href: '/tili/poista', label: 'Poista tili' })
    expect(ACCOUNT_DELETED_PATH).toBe('/tili-poistettu')
  })

  describe('AccountDeleted email', () => {
    it('renders what was deleted and kept, the time and the attribution, without a CTA', async () => {
      const { html, text } = await renderAccountDeleted({
        watchAreas: 2,
        deletedAt: '6.9.2026 klo 14.32',
        baseUrl: 'https://metsavahti.test',
        attribution: ATTRIBUTION,
      })
      expect(ACCOUNT_DELETED_SUBJECT).toBe('Tilisi on poistettu')
      expect(html).toContain('Tilisi on poistettu')
      for (const part of [html, text]) {
        expect(part).toContain('Tili, 2 vahtialuetta, ilmoitushistoria')
        expect(part).toContain('Suostumusmerkinnät ilman tiliä ja osoitetta')
        expect(part).toContain('6.9.2026 klo 14.32')
        expect(part).toContain('Tämä on viimeinen viesti')
        expect(part).toContain(ATTRIBUTION)
      }
      // No account left: no settings link, but the privacy policy stays.
      expect(html).not.toContain('/tili/ilmoitukset')
      expect(html).not.toContain('Ilmoitusasetukset')
      expect(html).toContain('https://metsavahti.test/tietosuoja')
    })

    it('words the watch-area count in Finnish', async () => {
      const render = (watchAreas: number) =>
        renderAccountDeleted({ watchAreas, deletedAt: 'x', baseUrl: 'https://m.test' })
      expect((await render(1)).text).toContain('Tili, 1 vahtialue, ilmoitushistoria')
      expect((await render(0)).text).toContain('Tili ja ilmoitushistoria')
    })
  })
})
