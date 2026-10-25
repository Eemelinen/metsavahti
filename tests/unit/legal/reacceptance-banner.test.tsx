// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { acceptLegalDocuments } from '@/app/(frontend)/(app)/actions'
import { ReacceptanceBanner } from '@/app/(frontend)/(app)/reacceptance-banner'
import { fi } from '@/i18n/fi'
import type { PendingDocument, Reacceptance } from '@/lib/legal/reacceptance'
import { reacceptanceSchema } from '@/lib/legal/reacceptance-schema'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/(frontend)/(app)/actions', () => ({
  acceptLegalDocuments: vi.fn(async () => ({
    ok: true,
    data: { status: 'accepted', written: 1 },
  })),
}))

const t = fi.legal.reacceptance

afterEach(() => {
  cleanup()
  refresh.mockClear()
  vi.mocked(acceptLegalDocuments).mockClear()
})

const TERMS: PendingDocument = {
  slug: 'terms',
  title: 'Käyttöehdot',
  version: '2026-10',
  href: '/kayttoehdot',
  changeSummary: 'Lisätty kohta vastuunrajauksesta.',
  requiresReacceptance: false,
}
const PRIVACY: PendingDocument = {
  slug: 'privacy',
  title: 'Tietosuojaseloste',
  version: '2026-10',
  href: '/tietosuoja',
  changeSummary: null,
  requiresReacceptance: true,
}

function soft(): Reacceptance {
  return { documents: [TERMS], blocking: false }
}

/** MV-086: the soft banner and the blocking modal of `ReacceptanceBanner`. */
describe('ReacceptanceBanner', () => {
  it('is a soft region whose "Lue muutokset" reveals the change summary and the document link', async () => {
    const user = userEvent.setup()
    render(<ReacceptanceBanner reacceptance={soft()} />)

    const region = screen.getByRole('region', { name: t.title })
    expect(within(region).getByText(t.softBody)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    const changes = screen.getByText(TERMS.changeSummary!).closest('ul')!
    expect(changes.hidden).toBe(true)

    const toggle = within(region).getByRole('button', { name: t.readChanges })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(changes.hidden).toBe(false)
    expect(screen.getByRole('link', { name: 'Käyttöehdot' }).getAttribute('href')).toBe(
      '/kayttoehdot',
    )
  })

  it('"Hyväksyn" sends the shown versions and refreshes the page', async () => {
    const user = userEvent.setup()
    render(<ReacceptanceBanner reacceptance={soft()} />)

    await user.click(screen.getByRole('button', { name: t.accept }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(acceptLegalDocuments).toHaveBeenCalledWith({
      documents: [{ slug: 'terms', version: '2026-10' }],
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('tells the user when a newer version was published meanwhile', async () => {
    vi.mocked(acceptLegalDocuments).mockResolvedValueOnce({
      ok: true,
      data: { status: 'outdated' },
    })
    const user = userEvent.setup()
    render(<ReacceptanceBanner reacceptance={soft()} />)

    await user.click(screen.getByRole('button', { name: t.accept }))
    expect((await screen.findByRole('alert')).textContent).toBe(t.outdated)
    expect(refresh).toHaveBeenCalled()
  })

  it('is a modal that Escape does not close when a document requires re-acceptance', async () => {
    const user = userEvent.setup()
    render(<ReacceptanceBanner reacceptance={{ documents: [TERMS, PRIVACY], blocking: true }} />)

    const dialog = screen.getByRole('dialog', { name: t.title })
    expect(within(dialog).getByText(t.blockingBody)).toBeTruthy()
    // The changes are open from the start; a missing summary points at the full text.
    expect(within(dialog).getByText(t.noSummary)).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: /sulje/i })).toBeNull()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: t.title })).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: t.accept }))
    await waitFor(() =>
      expect(acceptLegalDocuments).toHaveBeenCalledWith({
        documents: [
          { slug: 'terms', version: '2026-10' },
          { slug: 'privacy', version: '2026-10' },
        ],
      }),
    )
  })
})

describe('reacceptanceSchema', () => {
  it('accepts the terms and privacy documents once each', () => {
    expect(
      reacceptanceSchema.safeParse({ documents: [{ slug: 'terms', version: '2026-10' }] }).success,
    ).toBe(true)
  })

  it.each([
    ['no documents', { documents: [] }],
    ['a document that is not accepted', { documents: [{ slug: 'cookies', version: '2026-10' }] }],
    ['an empty version', { documents: [{ slug: 'terms', version: '' }] }],
    [
      'the same document twice',
      {
        documents: [
          { slug: 'terms', version: '2026-10' },
          { slug: 'terms', version: '2026-11' },
        ],
      },
    ],
  ])('rejects %s', (_label, input) => {
    expect(reacceptanceSchema.safeParse(input).success).toBe(false)
  })
})
