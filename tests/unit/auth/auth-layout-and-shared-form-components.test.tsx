// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import AuthLayout from '@/app/(frontend)/(auth)/layout'
import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { PasswordInput } from '@/components/forms/password-input'
import { fi } from '@/i18n/fi'
import {
  MIN_PASSWORD_LENGTH,
  MIN_PASSWORD_SCORE,
  scorePassword,
} from '@/lib/auth/password-strength'

afterEach(cleanup)

describe('AuthLayout', () => {
  it('renders the brand link, the centred card with the page and the attribution', () => {
    render(
      <AuthLayout>
        <h1>Kirjaudu</h1>
      </AuthLayout>,
    )
    expect(screen.getByRole('link', { name: 'Metsävahti' })).toHaveAttribute('href', '/')
    const card = screen.getByRole('main')
    expect(card).toContainElement(screen.getByRole('heading', { name: 'Kirjaudu' }))
    expect(card.className).toContain('max-w-md')
    expect(card.className).toContain('shadow-card')
    expect(screen.getByTestId('attribution')).toHaveTextContent(
      /Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa \d{2}\/\d{4}/,
    )
    expect(screen.queryByRole('banner')).toBeNull()
  })
})

describe('FormError / FormSuccess', () => {
  it('render nothing without a message', () => {
    const { container } = render(
      <>
        <FormError>{null}</FormError>
        <FormSuccess>{undefined}</FormSuccess>
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('FormError is an alert with the ember tint and keeps inline actions', () => {
    render(
      <FormError>
        Sähköpostiosoitetta ei ole vielä vahvistettu.{' '}
        <button type="button">Lähetä uudelleen</button>
      </FormError>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sähköpostiosoitetta ei ole vielä vahvistettu.')
    expect(alert.className).toContain('bg-ember-100')
    expect(alert.className).toContain('text-ember-700')
    expect(screen.getByRole('button', { name: 'Lähetä uudelleen' })).toBeInTheDocument()
  })

  it('FormSuccess is a status with the forest tint', () => {
    render(<FormSuccess id="sent">Jos osoite on rekisteröity, lähetimme ohjeet.</FormSuccess>)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('id', 'sent')
    expect(status).toHaveTextContent('lähetimme ohjeet')
    expect(status.className).toContain('bg-forest-50')
    expect(status.className).toContain('text-forest-700')
  })
})

describe('PasswordInput', () => {
  it('toggles between password and text and labels the toggle', async () => {
    const user = userEvent.setup()
    render(
      <>
        <label htmlFor="pw">Salasana</label>
        <PasswordInput autoComplete="current-password" id="pw" />
      </>,
    )
    const input = screen.getByLabelText('Salasana')
    expect(input).toHaveAttribute('type', 'password')
    const toggle = screen.getByRole('button', { name: fi.forms.password.showLabel })
    expect(toggle).toHaveAttribute('type', 'button')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveTextContent(fi.forms.password.show)

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: fi.forms.password.hideLabel })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(toggle).toHaveTextContent(fi.forms.password.hide)

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('shows the strength meter and updates the score while typing', async () => {
    const user = userEvent.setup()
    render(
      <>
        <label htmlFor="pw">Salasana</label>
        <PasswordInput id="pw" showStrength strengthInputs={['erkki@example.fi']} />
      </>,
    )
    const input = screen.getByLabelText('Salasana')
    const meter = screen.getByRole('meter', { name: fi.forms.password.strengthMeter })
    expect(input).toHaveAttribute('aria-describedby', 'pw-strength')
    expect(meter).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText(fi.forms.password.strengthHint)).toBeInTheDocument()
    const bars = () => meter.querySelectorAll('[data-filled="true"]')

    await user.type(input, 'lyhyt')
    await waitFor(() =>
      expect(screen.getByText(fi.forms.password.strength.tooShort)).toBeInTheDocument(),
    )
    expect(meter).toHaveAttribute('aria-valuenow', '0')
    expect(bars()).toHaveLength(0)

    await user.clear(input)
    await user.type(input, 'password1234')
    await waitFor(() => expect(meter).toHaveAttribute('aria-valuenow', '1'))
    expect(screen.getByText(fi.forms.password.strength[1])).toBeInTheDocument()
    expect(bars()).toHaveLength(1)
    expect(bars()[0]?.className).toContain('bg-ember-500')

    await user.clear(input)
    await user.type(input, 'kuusikko-kettu-lumi-7')
    await waitFor(() => expect(meter).toHaveAttribute('aria-valuenow', '4'))
    expect(screen.getByText(fi.forms.password.strength[4])).toBeInTheDocument()
    expect(bars()).toHaveLength(4)
    expect(bars()[3]?.className).toContain('bg-forest-600')
  })

  it('forwards onChange, ref and the rest of the input props', async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    let node: HTMLInputElement | null = null
    render(
      <PasswordInput
        aria-describedby="hint"
        aria-label="Salasana"
        name="password"
        onChange={(e) => seen.push(e.target.value)}
        ref={(el) => {
          node = el
        }}
        showStrength
      />,
    )
    const input = screen.getByLabelText('Salasana')
    await user.type(input, 'ab')
    expect(seen).toEqual(['a', 'ab'])
    expect(node).toBe(input)
    expect(input).toHaveAttribute('name', 'password')
    expect(input.getAttribute('aria-describedby')).toMatch(/^hint .+-strength$/)
  })
})

describe('scorePassword', () => {
  it('rejects short passwords before zxcvbn and applies the E03 thresholds', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10)
    expect(MIN_PASSWORD_SCORE).toBe(3)
    expect(scorePassword('')).toEqual({
      score: 0,
      label: fi.forms.password.strength.tooShort,
      acceptable: false,
    })
    expect(scorePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1)).label).toBe(
      fi.forms.password.strength.tooShort,
    )
    const weak = scorePassword('password1234')
    expect(weak.score).toBeLessThan(MIN_PASSWORD_SCORE)
    expect(weak.acceptable).toBe(false)
    const strong = scorePassword('kuusikko-kettu-lumi-7')
    expect(strong.score).toBe(4)
    expect(strong.label).toBe(fi.forms.password.strength[4])
    expect(strong.acceptable).toBe(true)
  })

  it('penalises the user inputs', () => {
    const email = 'erkki.esimerkki@example.fi'
    expect(scorePassword(email, [email]).score).toBeLessThan(scorePassword(email).score)
  })
})
