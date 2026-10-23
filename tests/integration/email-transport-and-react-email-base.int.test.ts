import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'

import { EMAIL_SETTINGS_PATH, EmailLayout } from '@/emails/EmailLayout'
import { renderEmail } from '@/emails/render'
import { env } from '@/lib/env'
import { emailProvider } from '@/lib/notifications/provider'
import { createMailpitClient } from '../helpers/mailpit'
import { getTestPayload } from '../helpers/payload'

const SUBJECT = 'Metsävahti MV-040: transport check'
const ATTRIBUTION = 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 09/2026'

describe('email transport + React Email base (MV-040)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)

  beforeAll(async () => {
    await mailpit.deleteAll()
  })

  it('selects the nodemailer adapter in the test environment', async () => {
    const payload = await getTestPayload()
    expect(emailProvider()).toBe('nodemailer')
    expect(payload.email.name).toBe('nodemailer')
    expect(payload.email.defaultFromAddress).toBe('noreply@metsavahti.test')
    expect(payload.email.defaultFromName).toBe('Metsävahti test')
  })

  it('payload.sendEmail delivers a layout-rendered message to Mailpit', async () => {
    const payload = await getTestPayload()
    const { html, text } = await renderEmail(
      createElement(
        EmailLayout,
        {
          preview: 'Kuljetustesti',
          badge: { label: 'Testi', tone: 'neutral' },
          heading: 'Sähköpostikuljetus toimii',
          lead: 'Tämä viesti lähetettiin integraatiotestistä.',
          cta: { label: 'Avaa Metsävahti', href: `${env.NEXT_PUBLIC_SERVER_URL}/dashboard` },
          footerWhy: 'Saat tämän viestin, koska integraatiotesti lähetti sen.',
          baseUrl: env.NEXT_PUBLIC_SERVER_URL,
          attribution: ATTRIBUTION,
        },
        createElement('p', null, 'Runko-osa'),
      ),
    )

    await payload.sendEmail({ to: 'vastaanottaja@metsavahti.test', subject: SUBJECT, html, text })

    await mailpit.waitForMessages(1)
    const messages = (await mailpit.listMessages()).filter((m) => m.Subject === SUBJECT)
    expect(messages).toHaveLength(1)
    expect(messages[0]!.To[0]!.Address).toBe('vastaanottaja@metsavahti.test')
    expect(messages[0]!.From.Address).toBe('noreply@metsavahti.test')

    const full = await mailpit.getMessage(messages[0]!.ID)
    expect(full.HTML).toContain('Sähköpostikuljetus toimii')
    expect(full.HTML).toContain('Runko-osa')
    expect(full.HTML).toContain(`${env.NEXT_PUBLIC_SERVER_URL}${EMAIL_SETTINGS_PATH}`)
    expect(full.HTML).toContain(ATTRIBUTION)
    expect(full.Text).toContain(ATTRIBUTION)
  })
})
