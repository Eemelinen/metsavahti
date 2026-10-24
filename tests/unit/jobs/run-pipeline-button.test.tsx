// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RunPipelineButton } from '@/components/admin/run-pipeline-button'
import { fi } from '@/i18n/fi'

const { toast, refresh } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  refresh: vi.fn(),
}))

// The admin UI kit needs Payload's providers; a plain button keeps the behaviour under test.
vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  toast,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const t = fi.admin.runPipeline

/** MV-070: the admin "Aja haku nyt" button above the `job-runs` list. */
describe('RunPipelineButton', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  async function clickButton() {
    render(<RunPipelineButton />)
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: t.button }))
    })
  }

  it('posts to /api/jobs/run with the session cookie and reports success', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, runId: '7' }))
    await clickButton()

    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/run', {
      method: 'POST',
      credentials: 'same-origin',
    })
    expect(toast.success).toHaveBeenCalledWith(t.succeeded)
    expect(toast.error).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: t.button })).toBeEnabled()
  })

  it('is disabled and says so while the run is in progress', async () => {
    let finish: (res: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<RunPipelineButton />)
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: t.button }))
    })

    expect(screen.getByRole('button', { name: t.running })).toBeDisabled()
    await act(async () => finish(Response.json({ ok: true })))
    expect(screen.getByRole('button', { name: t.button })).toBeEnabled()
  })

  it.each([
    ['a failed run', () => Promise.resolve(Response.json({ ok: false, status: 'error' }))],
    ['a refusal', () => Promise.resolve(Response.json({ ok: false }, { status: 403 }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('reports %s as an error and still refreshes the list', async (_, respond) => {
    fetchMock.mockImplementation(respond)
    await clickButton()

    expect(toast.error).toHaveBeenCalledWith(t.failed)
    expect(toast.success).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })
})
