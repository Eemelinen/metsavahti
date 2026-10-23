import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMAIL_PRIVACY_PATH, EMAIL_SETTINGS_PATH, EmailLayout } from '@/emails/EmailLayout'
import { renderEmail } from '@/emails/render'

const ATTRIBUTION = 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 09/2026'

async function providerWith(vars: Record<string, string>) {
  vi.resetModules()
  vi.stubEnv('SMTP_HOST', '')
  vi.stubEnv('RESEND_API_KEY', '')
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value)
  const { emailProvider } = await import('@/lib/notifications/provider')
  return emailProvider()
}

describe('email transport selection (MV-040)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses nodemailer (Mailpit) when SMTP_HOST is set, even with a Resend key', async () => {
    expect(await providerWith({ SMTP_HOST: 'localhost', RESEND_API_KEY: 're_test' })).toBe(
      'nodemailer',
    )
  })

  it('uses Resend when only RESEND_API_KEY is set', async () => {
    expect(await providerWith({ RESEND_API_KEY: 're_test' })).toBe('resend')
  })

  it('falls back to console logging when neither is set', async () => {
    expect(await providerWith({})).toBe('none')
  })
})

describe('EmailLayout (MV-040)', () => {
  it('renders the full layout: header, badge, CTA with fallback, note, footer links, attribution', async () => {
    const { html, text } = await renderEmail(
      createElement(
        EmailLayout,
        {
          preview: 'Vahvista sähköpostiosoitteesi, niin vahtialueet aukeavat',
          badge: { label: 'Tervetuloa', tone: 'forest' },
          heading: 'Vahvista sähköpostiosoitteesi',
          lead: 'Kiitos, että loit tilin. Linkki on voimassa 24 tuntia.',
          cta: {
            label: 'Vahvista sähköposti',
            href: 'https://metsavahti.test/vahvista?token=abc',
            showFallback: true,
          },
          note: 'Jos et luonut tiliä Metsävahtiin, voit jättää tämän viestin huomiotta.',
          footerWhy: 'Saat tämän viestin, koska tällä osoitteella luotiin tili Metsävahtiin.',
          baseUrl: 'https://metsavahti.test',
          unsubscribeUrl: 'https://metsavahti.test/lopeta?token=xyz',
          attribution: ATTRIBUTION,
        },
        createElement('p', { 'data-testid': 'body' }, 'Template body'),
      ),
    )

    expect(html).toMatchSnapshot()
    expect(text).toMatchSnapshot()

    expect(html).toContain('Metsävahti')
    expect(html).toContain('Tervetuloa')
    expect(html).toContain('Template body')
    expect(html).toContain('href="https://metsavahti.test/vahvista?token=abc"')
    expect(html).toContain(`https://metsavahti.test${EMAIL_SETTINGS_PATH}`)
    expect(html).toContain(`https://metsavahti.test${EMAIL_PRIVACY_PATH}`)
    expect(html).toContain('Lopeta tämän alueen ilmoitukset')
    expect(html).toContain(ATTRIBUTION)
    expect(text).toContain('VAHVISTA SÄHKÖPOSTIOSOITTEESI')
    expect(text).toContain(ATTRIBUTION)
  })

  it('omits the optional parts and still carries the settings link and attribution', async () => {
    const { html } = await renderEmail(
      createElement(EmailLayout, {
        preview: 'Tilisi on poistettu',
        heading: 'Tilisi on poistettu',
        footerWhy: 'Tämä on viimeinen viesti, jonka lähetämme tähän osoitteeseen.',
        baseUrl: 'https://metsavahti.test',
        attribution: ATTRIBUTION,
      }),
    )
    expect(html).not.toContain('Lopeta tämän alueen ilmoitukset')
    expect(html).not.toContain('Jos painike ei toimi')
    expect(html).toContain(`https://metsavahti.test${EMAIL_SETTINGS_PATH}`)
    expect(html).toContain(ATTRIBUTION)
  })

  it('defaults the attribution to the current month', async () => {
    const { text } = await renderEmail(
      createElement(EmailLayout, {
        preview: 'x',
        heading: 'x',
        footerWhy: 'x',
        baseUrl: 'https://metsavahti.test',
      }),
    )
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    expect(text).toContain(`Metsänkäyttöilmoitukset-aineistoa ${mm}/${now.getFullYear()}`)
  })
})
