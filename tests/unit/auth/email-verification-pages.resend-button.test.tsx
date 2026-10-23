// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resendVerification } from '@/app/(frontend)/(auth)/vahvista-sahkoposti/actions'
import { ResendButton } from '@/app/(frontend)/(auth)/vahvista-sahkoposti/resend-button'

vi.mock('@/app/(frontend)/(auth)/vahvista-sahkoposti/actions', () => ({
  resendVerification: vi.fn(),
}))

const action = vi.mocked(resendVerification)
// `@/lib/errors` pulls the server logger in, which jsdom must not import; the copy is fixed.
const RATE_LIMITED = 'Liikaa pyyntöjä. Yritä hetken kuluttua uudelleen.'

/**
 * The click resolves the mocked action in a microtask outside React's act scope, so the state
 * it sets would otherwise race the auto-advancing fake clock; the act wrapper flushes it first.
 */
async function click(user: UserEvent, button: HTMLElement) {
  await act(async () => {
    await user.click(button)
  })
}

/** MV-043: the "Lähetä uudelleen" button and its 60 s cooldown (App artboard `vahvista`). */
describe('ResendButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    action.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('sends, confirms and counts down before it can be used again', async () => {
    action.mockResolvedValue({ ok: true, data: { cooldownSeconds: 60 } })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ResendButton email="anna.k@example.fi" />)

    const button = screen.getByRole('button', { name: 'Lähetä uudelleen' })
    await click(user, button)
    expect(action).toHaveBeenCalledWith({ email: 'anna.k@example.fi' })
    expect(screen.getByRole('status')).toHaveTextContent('Vahvistuslinkki lähetetty uudelleen.')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Lähetä uudelleen (60 s)')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000)
    })
    expect(button).toHaveTextContent('Lähetä uudelleen (1 s)')
    expect(button).toBeDisabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(button).toHaveTextContent('Lähetä uudelleen')
    expect(button).toBeEnabled()
  })

  it('turns a short server refusal into the countdown and shows other errors', async () => {
    action.mockResolvedValueOnce({
      ok: false,
      error: { code: 'rate_limited', message: RATE_LIMITED, retryAfterSeconds: 42 },
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ResendButton email="anna.k@example.fi" />)
    const button = screen.getByRole('button', { name: 'Lähetä uudelleen' })
    await click(user, button)
    expect(button).toHaveTextContent('Lähetä uudelleen (42 s)')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(42_000)
    })
    action.mockResolvedValueOnce({
      ok: false,
      error: { code: 'rate_limited', message: RATE_LIMITED, retryAfterSeconds: 3600 },
    })
    await click(user, button)
    expect(screen.getByRole('alert')).toHaveTextContent(RATE_LIMITED)
    expect(button).toBeEnabled()
  })
})
