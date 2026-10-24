import { headers } from 'next/headers'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { submitContact } from '@/app/(frontend)/(marketing)/yhteystiedot/actions'
import { submitDataRequest } from '@/app/(frontend)/(legal)/tietopyynto/actions'
import { dataRequestReceiptLimiter, publicFormRateLimiter } from '@/lib/public-forms/public-forms'
import { TOO_MANY_REQUESTS_PATH } from '@/lib/rate-limit'
import { createMailpitClient, type MailpitMessage } from '../helpers/mailpit'
import { getTestPayload, resetDatabase } from '../helpers/payload'

// The Server Actions run without a request context; only `headers()` is stubbed.
vi.mock('next/headers', () => ({ headers: vi.fn() }))

const CONTACT_EMAIL = process.env.CONTACT_EMAIL!
const DPO_EMAIL = process.env.DPO_EMAIL!

let ipCounter = 0
/** Every test posts from its own documentation address, so the per-IP buckets never meet. */
function fromNewAddress(): void {
  ipCounter += 1
  vi.mocked(headers).mockResolvedValue(
    new Headers({ 'x-forwarded-for': `198.51.100.${ipCounter}` }) as never,
  )
}

/**
 * MV-095: `submitContact` and `submitDataRequest` against a real Payload + Mailpit: the
 * `ContactReceived` email to `CONTACT_EMAIL`, both data-request emails (`DataRequestReceived`
 * to `DPO_EMAIL`, the receipt to the requester) with one reference and `Reply-To` the sender,
 * server-side validation, the honeypot and the per-IP limit.
 */
describe('public data-request and contact forms (MV-095)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)

  /** The messages to `to` whose subject matches, once `count` of them have arrived. */
  async function messagesTo(to: string, subject: RegExp | string, count: number) {
    const matching = async () =>
      (await mailpit.listMessages()).filter(
        (m) =>
          m.To.some((r) => r.Address === to) &&
          (typeof subject === 'string' ? m.Subject === subject : subject.test(m.Subject)),
      )
    const deadline = Date.now() + 10_000
    let found = await matching()
    while (found.length < count && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200))
      found = await matching()
    }
    expect(found).toHaveLength(count)
    return Promise.all(found.map((m) => mailpit.getMessage(m.ID)))
  }

  beforeAll(async () => {
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await mailpit.deleteAll()
  })

  beforeEach(async () => {
    fromNewAddress()
    await dataRequestReceiptLimiter.reset()
  })

  it('mails a contact message to CONTACT_EMAIL as ContactReceived, Reply-To the visitor', async () => {
    const name = `Anna Metsä ${Date.now()}`
    await expect(
      submitContact({
        name,
        email: 'Anna.Contact@Example.FI',
        message: 'Kuvio 12 näkyy väärässä paikassa.\nToinen rivi.',
        consent: true,
        website: '',
      }),
    ).resolves.toEqual({ ok: true, data: { sent: true } })

    const [message] = await messagesTo(CONTACT_EMAIL, `Yhteydenotto: ${name}`, 1)
    expectReplyTo(message!, 'anna.contact@example.fi')
    expect(message!.HTML).toContain('Uusi yhteydenotto')
    expect(message!.HTML).toContain('Kuvio 12 näkyy väärässä paikassa.')
    expect(message!.Text).toContain('Toinen rivi.')
    expect(message!.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
    // Nothing goes to the visitor from the contact form.
    expect(
      (await mailpit.listMessages()).filter((m) =>
        m.To.some((r) => r.Address === 'anna.contact@example.fi'),
      ),
    ).toEqual([])
  })

  it('sends DataRequestReceived to DPO_EMAIL and the receipt to the requester with one reference', async () => {
    const requester = `requester-${Date.now()}@metsavahti.test`
    await expect(
      submitDataRequest({
        email: requester,
        type: 'erasure',
        message: 'Poistakaa kaikki tietoni.',
        consent: true,
      }),
    ).resolves.toEqual({ ok: true, data: { sent: true } })

    const [receipt] = await messagesTo(requester, 'Tietopyyntösi on vastaanotettu', 1)
    const reference = /TP-[0-9A-F]{8}/.exec(receipt!.HTML)?.[0]
    expect(reference).toBeDefined()
    expect(receipt!.HTML).toContain('Poisto')
    expect(receipt!.HTML).toContain('30 päivän')
    expect(receipt!.HTML).not.toContain('Poistakaa kaikki tietoni.')
    expect(receipt!.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')

    const [internal] = await messagesTo(DPO_EMAIL, `Tietopyyntö ${reference}`, 1)
    expectReplyTo(internal!, requester)
    expect(internal!.HTML).toContain('Uusi tietopyyntö')
    expect(internal!.HTML).toContain(requester)
    expect(internal!.HTML).toContain('Poistakaa kaikki tietoni.')
    expect(internal!.HTML).toContain('Metsänkäyttöilmoitukset-aineistoa')
  })

  it('refuses invalid input field by field and sends nothing', async () => {
    const before = (await mailpit.listMessages()).length
    await expect(
      submitDataRequest({ email: 'ei-osoite', type: 'muu', message: '', consent: false }),
    ).resolves.toEqual({
      ok: false,
      fieldErrors: {
        email: 'Anna toimiva sähköpostiosoite.',
        type: 'Valitse pyynnön tyyppi.',
        message: 'Kirjoita viesti.',
        consent: 'Suostumus tarvitaan, jotta voimme vastata.',
      },
    })
    await expect(
      submitContact({ name: 'x'.repeat(101), email: 'a@b.fi', message: 'Hei', consent: true }),
    ).resolves.toEqual({
      ok: false,
      fieldErrors: { name: 'Nimi on liian pitkä (enintään 100 merkkiä).' },
    })
    expect((await mailpit.listMessages()).length).toBe(before)
  })

  it('answers a filled honeypot with the normal success and sends nothing', async () => {
    const bot = `bot-${Date.now()}@metsavahti.test`
    const before = (await mailpit.listMessages()).length
    const spam = { email: bot, message: 'Buy now', consent: true, website: 'https://spam.test' }
    await expect(submitContact({ ...spam, name: 'Bot' })).resolves.toEqual({
      ok: true,
      data: { sent: true },
    })
    await expect(submitDataRequest({ ...spam, type: 'other' })).resolves.toEqual({
      ok: true,
      data: { sent: true },
    })
    // Give a stray send time to arrive before asserting there was none.
    await new Promise((r) => setTimeout(r, 1_000))
    expect((await mailpit.listMessages()).length).toBe(before)
  })

  it('sends the sixth post of a form from one address to /liikaa-pyyntoja; the other form has its own budget', async () => {
    await publicFormRateLimiter.reset()
    const invalid = { email: 'x', message: '', consent: false }
    for (let i = 0; i < 5; i += 1) {
      await expect(submitContact({ ...invalid, name: '' })).resolves.toMatchObject({ ok: false })
    }
    await expect(submitContact({ ...invalid, name: '' })).rejects.toMatchObject({
      digest: expect.stringContaining(`;${TOO_MANY_REQUESTS_PATH};`),
    })
    await expect(submitDataRequest({ ...invalid, type: 'access' })).resolves.toMatchObject({
      ok: false,
      fieldErrors: expect.any(Object),
    })
  })
})

function expectReplyTo(message: MailpitMessage, address: string): void {
  expect(message.ReplyTo.map((r) => r.Address)).toEqual([address])
}
