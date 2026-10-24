// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportSection } from '@/app/(frontend)/(app)/tili/tietosuoja/export-section'
import { fi } from '@/i18n/fi'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const copy = fi.account.privacy.export

/** MV-093: the export section of `/tili/tietosuoja` in each state. */
describe('ExportSection', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const base = {
    email: 'anna@example.fi',
    expiresAt: null,
    downloadUrl: null,
    nextAllowedAt: null,
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    fetchMock.mockReset()
    refresh.mockReset()
    vi.unstubAllGlobals()
  })

  it('posts the request as JSON and shows the pending state', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ ok: true, data: { id: 1, status: 'pending' } }, { status: 202 }),
    )
    render(<ExportSection {...base} status="none" />)
    await userEvent.click(screen.getByRole('button', { name: copy.request }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/account/export',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(copy.pending)
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the route’s message when the request is refused', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { ok: false, error: { code: 'rate_limited', message: 'Liikaa pyyntöjä.' } },
        { status: 429 },
      ),
    )
    render(<ExportSection {...base} status="expired" />)
    expect(screen.getByText(copy.expired)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: copy.request }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Liikaa pyyntöjä.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('offers the download link while ready and hides the button', () => {
    render(
      <ExportSection
        {...base}
        downloadUrl="/api/account/export/3?token=t"
        expiresAt="25.10.2026 klo 14.32"
        nextAllowedAt="25.10.2026 klo 14.32"
        status="ready"
      />,
    )
    expect(screen.getByRole('link', { name: copy.download })).toHaveAttribute(
      'href',
      '/api/account/export/3?token=t',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      copy.ready('anna@example.fi', '25.10.2026 klo 14.32'),
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says when the next request is allowed, and that a failed one can be retried', () => {
    const { unmount } = render(
      <ExportSection {...base} nextAllowedAt="25.10.2026 klo 9.00" status="expired" />,
    )
    expect(screen.getByText(copy.limited('25.10.2026 klo 9.00'))).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
    render(<ExportSection {...base} status="failed" />)
    expect(screen.getByRole('alert')).toHaveTextContent(copy.failed)
    expect(screen.getByRole('button', { name: copy.request })).toBeEnabled()
  })
})
