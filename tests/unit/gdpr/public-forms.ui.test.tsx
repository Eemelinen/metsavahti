// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ContactForm, type SubmitContact } from '@/components/public-forms/contact-form'
import {
  DataRequestForm,
  type SubmitDataRequest,
} from '@/components/public-forms/data-request-form'

/** MV-095: the two public forms in the browser (validation, honeypot, success, server errors). */
describe('public forms (MV-095)', () => {
  afterEach(() => cleanup())

  it('contact: shows the artboard errors without posting, then posts and thanks', async () => {
    const action = vi.fn<SubmitContact>(async () => ({ ok: true, data: { sent: true } }))
    render(<ContactForm action={action} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Lähetä viesti' }))
    expect(await screen.findByText('Anna toimiva sähköpostiosoite.')).toBeInTheDocument()
    expect(screen.getByText('Kirjoita viesti.')).toBeInTheDocument()
    expect(screen.getByText('Suostumus tarvitaan, jotta voimme vastata.')).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Nimi'), 'Anna')
    await user.type(screen.getByLabelText(/Sähköposti/), 'anna@example.fi')
    await user.type(screen.getByLabelText(/Viesti/), 'Hei!')
    await user.click(screen.getByRole('checkbox', { name: /tietosuojaselosteen/ }))
    await user.click(screen.getByRole('button', { name: 'Lähetä viesti' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Kiitos viestistäsi')
    expect(screen.getByRole('status')).toHaveTextContent('anna@example.fi')
    expect(action).toHaveBeenCalledWith({
      name: 'Anna',
      email: 'anna@example.fi',
      message: 'Hei!',
      consent: true,
      website: '',
    })

    // "Lähetä toinen viesti" keeps the name and address, clears the message and the consent.
    await user.click(screen.getByRole('button', { name: 'Lähetä toinen viesti' }))
    expect(screen.getByLabelText('Nimi')).toHaveValue('Anna')
    expect(screen.getByLabelText(/Viesti/)).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: /tietosuojaselosteen/ })).not.toBeChecked()
  })

  it('contact: the honeypot is out of the tab order and hidden from assistive technology', () => {
    render(<ContactForm action={vi.fn<SubmitContact>()} />)
    const trap = document.getElementById('website')!
    expect(trap).toHaveAttribute('tabindex', '-1')
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Jätä tämä kenttä tyhjäksi' })).toBeNull()
  })

  it('data request: preselects Tarkastus, sends the chosen type and shows server field errors', async () => {
    const action = vi
      .fn<SubmitDataRequest>()
      .mockResolvedValueOnce({
        ok: false,
        fieldErrors: { email: 'Anna toimiva sähköpostiosoite.' },
      })
      .mockResolvedValueOnce({ ok: true, data: { sent: true } })
    render(<DataRequestForm action={action} />)
    const user = userEvent.setup()

    expect(screen.getByRole('radio', { name: /Tarkastus/ })).toBeChecked()
    expect(screen.getByRole('link', { name: 'Tili → Tietosuoja ja tiedot' })).toHaveAttribute(
      'href',
      '/tili/tietosuoja',
    )
    await user.type(screen.getByLabelText(/Sähköposti/), 'anna@example.fi')
    await user.click(screen.getByRole('radio', { name: /Poisto/ }))
    await user.type(screen.getByLabelText(/Viesti/), 'Poistakaa tietoni.')
    await user.click(screen.getByRole('checkbox', { name: /tietosuojaselosteen/ }))
    await user.click(screen.getByRole('button', { name: 'Lähetä tietopyyntö' }))
    expect(await screen.findByText('Anna toimiva sähköpostiosoite.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lähetä tietopyyntö' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Tietopyyntö vastaanotettu')
    expect(action).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: 'anna@example.fi', type: 'erasure', consent: true }),
    )
  })

  it('data request: a form-level failure is shown as an alert', async () => {
    const action = vi.fn<SubmitDataRequest>(async () => ({
      ok: false,
      error: { code: 'internal', message: 'Jotain meni pieleen. Yritä myöhemmin uudelleen.' },
    }))
    render(<DataRequestForm action={action} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/Sähköposti/), 'anna@example.fi')
    await user.type(screen.getByLabelText(/Viesti/), 'Mitä tietoja minusta on?')
    await user.click(screen.getByRole('checkbox', { name: /tietosuojaselosteen/ }))
    await user.click(screen.getByRole('button', { name: 'Lähetä tietopyyntö' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Jotain meni pieleen')
  })
})
