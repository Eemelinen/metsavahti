import type { Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fieldErrorsOf } from '@/lib/account/account-schema'
import { renderContactReceived } from '@/emails/ContactReceived'
import { renderDataRequestConfirmation } from '@/emails/DataRequestConfirmation'
import { renderDataRequestReceived } from '@/emails/DataRequestReceived'
import {
  DEFAULT_CONTACT_EMAIL,
  DEFAULT_DPO_EMAIL,
  dataRequestReceiptLimiter,
  dataRequestReference,
  publicFormInboxes,
  sendContactMessage,
  sendDataRequest,
} from '@/lib/public-forms/public-forms'
import {
  type DataRequestFormValues,
  MAX_MESSAGE_LENGTH,
  contactFormSchema,
  dataRequestFormSchema,
  isSpam,
} from '@/lib/public-forms/public-forms-schema'

const ATTRIBUTION = 'Metsänkäyttöilmoitukset-aineistoa'
const BASE_URL = 'https://metsavahti.test'

function fakePayload() {
  const sendEmail = vi.fn(async (_message: Record<string, unknown>) => ({}))
  return { payload: { sendEmail } as unknown as Payload, sendEmail }
}

const contact = {
  name: ' Anna Metsä ',
  email: ' Anna@Example.FI ',
  message: '  Hei, kysyisin palvelusta.  ',
  consent: true,
}

const request: DataRequestFormValues = {
  email: 'anna@example.fi',
  type: 'erasure',
  message: 'Poistakaa tietoni.',
  consent: true,
}

/** MV-095: the pure parts of the public forms (schemas, honeypot, emails, send order). */
describe('public data-request and contact forms (MV-095)', () => {
  beforeEach(async () => {
    await dataRequestReceiptLimiter.reset()
  })

  describe('contactFormSchema', () => {
    it('trims the fields, lower-cases the address and accepts an empty name', () => {
      expect(contactFormSchema.parse(contact)).toEqual({
        name: 'Anna Metsä',
        email: 'anna@example.fi',
        message: 'Hei, kysyisin palvelusta.',
        consent: true,
      })
      expect(contactFormSchema.parse({ ...contact, name: '' }).name).toBe('')
    })

    it('names every missing or invalid field with the artboard copy', () => {
      const parsed = contactFormSchema.safeParse({
        name: 'x'.repeat(101),
        email: 'ei-osoite',
        message: ' a ',
        consent: false,
      })
      expect(parsed.success).toBe(false)
      expect(fieldErrorsOf(parsed.error!)).toEqual({
        name: 'Nimi on liian pitkä (enintään 100 merkkiä).',
        email: 'Anna toimiva sähköpostiosoite.',
        message: 'Kirjoita viesti.',
        consent: 'Suostumus tarvitaan, jotta voimme vastata.',
      })
      const long = contactFormSchema.safeParse({
        ...contact,
        message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1),
      })
      expect(fieldErrorsOf(long.error!)).toEqual({
        message: 'Viesti on liian pitkä (enintään 5000 merkkiä).',
      })
    })
  })

  describe('dataRequestFormSchema', () => {
    it('accepts the three request types and refuses anything else', () => {
      for (const type of ['access', 'erasure', 'other'] as const) {
        expect(dataRequestFormSchema.parse({ ...request, type }).type).toBe(type)
      }
      const parsed = dataRequestFormSchema.safeParse({ ...request, type: 'tarkastus' })
      expect(fieldErrorsOf(parsed.error!)).toEqual({ type: 'Valitse pyynnön tyyppi.' })
    })
  })

  it('treats any non-blank honeypot as spam', () => {
    expect(isSpam({})).toBe(false)
    expect(isSpam({ website: '' })).toBe(false)
    expect(isSpam({ website: '   ' })).toBe(false)
    expect(isSpam({ website: 'https://spam.example' })).toBe(true)
  })

  it('makes references of the form TP-XXXXXXXX', () => {
    const references = new Set(Array.from({ length: 20 }, () => dataRequestReference()))
    for (const reference of references) expect(reference).toMatch(/^TP-[0-9A-F]{8}$/)
    expect(references.size).toBe(20)
  })

  describe('emails', () => {
    it('ContactReceived carries the sender, the message as text and the attribution', async () => {
      const { html, text } = await renderContactReceived({
        name: '',
        email: 'anna@example.fi',
        message: '<script>alert(1)</script>\nToinen rivi',
        receivedAt: '24.10.2026 klo 12.00',
        baseUrl: BASE_URL,
      })
      expect(html).toContain('Uusi yhteydenotto')
      expect(html).toContain('(ei annettu)')
      expect(html).toContain('anna@example.fi')
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain(ATTRIBUTION)
      expect(html).not.toContain('/tili/ilmoitukset')
      expect(text).toContain('Toinen rivi')
    })

    it('DataRequestReceived names the reference, the type and the 30-day period', async () => {
      const { html } = await renderDataRequestReceived({
        reference: 'TP-0A1B2C3D',
        type: 'erasure',
        email: 'anna@example.fi',
        message: 'Poistakaa tietoni.',
        receivedAt: '24.10.2026 klo 12.00',
        baseUrl: BASE_URL,
      })
      expect(html).toContain('TP-0A1B2C3D')
      expect(html).toContain('Poisto')
      expect(html).toContain('30 päivän')
      expect(html).toContain('Poistakaa tietoni.')
      expect(html).toContain(ATTRIBUTION)
    })

    it('the receipt repeats reference and type but never the message', async () => {
      const { html } = await renderDataRequestConfirmation({
        reference: 'TP-0A1B2C3D',
        type: 'access',
        receivedAt: '24.10.2026 klo 12.00',
        baseUrl: BASE_URL,
      })
      expect(html).toContain('Tietopyyntösi on vastaanotettu')
      expect(html).toContain('TP-0A1B2C3D')
      expect(html).toContain('Tarkastus')
      expect(html).toContain(`${BASE_URL}/tietosuoja`)
      expect(html).toContain(ATTRIBUTION)
    })
  })

  describe('sending', () => {
    it('mails a contact message to CONTACT_EMAIL with Reply-To the visitor', async () => {
      const { payload, sendEmail } = fakePayload()
      await expect(sendContactMessage(payload, contactFormSchema.parse(contact))).resolves.toEqual({
        status: 'sent',
      })
      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect(sendEmail.mock.calls[0]![0]).toMatchObject({
        to: process.env.CONTACT_EMAIL,
        replyTo: 'anna@example.fi',
        subject: 'Yhteydenotto: Anna Metsä',
      })
    })

    it('sends the DPO email first, then the receipt, with one reference', async () => {
      const { payload, sendEmail } = fakePayload()
      const outcome = await sendDataRequest(payload, request)
      expect(outcome).toMatchObject({ status: 'sent', receipt: true })
      const reference = (outcome as { reference: string }).reference
      expect(sendEmail).toHaveBeenCalledTimes(2)
      const [dpo, receipt] = sendEmail.mock.calls.map(([message]) => message)
      expect(dpo).toMatchObject({
        to: process.env.DPO_EMAIL,
        replyTo: request.email,
        subject: `Tietopyyntö ${reference}`,
      })
      expect(receipt).toMatchObject({
        to: request.email,
        subject: 'Tietopyyntösi on vastaanotettu',
      })
      expect(receipt!.html).toContain(reference)
      expect(receipt!.html).not.toContain(request.message)
    })

    it('stops the receipts to one address after three a day, never the DPO email', async () => {
      const { payload, sendEmail } = fakePayload()
      for (let i = 0; i < 3; i++) {
        await expect(sendDataRequest(payload, request)).resolves.toMatchObject({ receipt: true })
      }
      await expect(sendDataRequest(payload, request)).resolves.toMatchObject({
        status: 'sent',
        receipt: false,
      })
      const recipients = sendEmail.mock.calls.map(([message]) => message.to)
      expect(recipients.filter((to) => to === process.env.DPO_EMAIL)).toHaveLength(4)
      expect(recipients.filter((to) => to === request.email)).toHaveLength(3)
    })

    it('sends nothing when the honeypot is filled', async () => {
      const { payload, sendEmail } = fakePayload()
      await expect(
        sendContactMessage(payload, { ...contactFormSchema.parse(contact), website: 'x' }),
      ).resolves.toEqual({ status: 'ignored' })
      await expect(sendDataRequest(payload, { ...request, website: 'x' })).resolves.toEqual({
        status: 'ignored',
      })
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('reads the inboxes from the environment, the artboard addresses being the defaults', () => {
      expect(publicFormInboxes()).toEqual({
        contact: process.env.CONTACT_EMAIL,
        dpo: process.env.DPO_EMAIL,
      })
      expect([DEFAULT_CONTACT_EMAIL, DEFAULT_DPO_EMAIL]).toEqual([
        'tuki@metsavahti.fi',
        'tietosuoja@metsavahti.fi',
      ])
    })
  })
})
