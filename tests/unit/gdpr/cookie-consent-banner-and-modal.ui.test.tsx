// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConsentManager } from '@/components/consent/consent-manager'
import { COOKIE_SETTINGS_EVENT } from '@/components/cookie-settings-button'
import { fi } from '@/i18n/fi'
import { type CookieConsent, createConsent } from '@/lib/consent/consent-cookie'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const SCRIPT_URL = 'https://analytics.metsavahti.test/script.js'
const banner = fi.consent.banner
const modal = fi.consent.modal

function analyticsScripts() {
  return document.head.querySelectorAll(`script[src="${SCRIPT_URL}"]`)
}

/** MV-090: `ConsentBanner` + `ConsentModal` as `ConsentManager` puts them together. */
describe('ConsentManager', () => {
  const fetchMock = vi.fn<typeof fetch>()

  /** The route's answer: the consent it stored. */
  function answer(analytics: boolean) {
    fetchMock.mockResolvedValueOnce(
      Response.json({ ok: true, consent: createConsent(analytics) }, { status: 200 }),
    )
  }

  function sentBodies() {
    return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as unknown)
  }

  function renderManager(initialConsent: CookieConsent | null = null) {
    return render(
      <ConsentManager analyticsScriptUrl={SCRIPT_URL} initialConsent={initialConsent} />,
    )
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    for (const script of analyticsScripts()) script.remove()
  })

  it('shows the banner with two equal choices when nothing is stored', () => {
    renderManager()
    const region = screen.getByRole('region', { name: banner.label })
    const accept = within(region).getByRole('button', { name: banner.acceptAll })
    const necessary = within(region).getByRole('button', { name: banner.necessaryOnly })
    within(region).getByRole('button', { name: banner.customize })
    // Same size and weight: only the colours differ.
    const sizing = (el: HTMLElement) =>
      el.className.split(' ').filter((c) => /^(min-|flex-|px-|py-|text-base|font-|rounded)/.test(c))
    expect(sizing(accept)).toEqual(sizing(necessary))
    expect(within(region).getByRole('link', { name: banner.cookiesLink })).toHaveAttribute(
      'href',
      '/evasteet',
    )
    expect(within(region).getByRole('link', { name: banner.privacyLink })).toHaveAttribute(
      'href',
      '/tietosuoja',
    )
    expect(analyticsScripts()).toHaveLength(0)
  })

  it('hides the banner once a choice is stored', () => {
    renderManager(createConsent(false))
    expect(screen.queryByRole('region', { name: banner.label })).toBeNull()
  })

  it('"Vain välttämättömät" stores analytics off and loads nothing', async () => {
    answer(false)
    renderManager()
    await userEvent.click(screen.getByRole('button', { name: banner.necessaryOnly }))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/consent',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(sentBodies()).toEqual([{ analytics: false }])
    expect(screen.queryByRole('region', { name: banner.label })).toBeNull()
    expect(analyticsScripts()).toHaveLength(0)
  })

  it('"Hyväksy kaikki" stores analytics on and loads the script once', async () => {
    answer(true)
    renderManager()
    await userEvent.click(screen.getByRole('button', { name: banner.acceptAll }))
    expect(sentBodies()).toEqual([{ analytics: true }])
    expect(screen.queryByRole('region', { name: banner.label })).toBeNull()
    expect(analyticsScripts()).toHaveLength(1)
  })

  it('loads the script for a returning visitor who granted analytics', () => {
    renderManager(createConsent(true))
    expect(analyticsScripts()).toHaveLength(1)
  })

  it('loads nothing when no analytics script is configured', () => {
    render(<ConsentManager initialConsent={createConsent(true)} />)
    expect(document.head.querySelectorAll('script[data-analytics]')).toHaveLength(0)
  })

  it('"Mukauta" opens the modal: necessary locked on, analytics off until switched', async () => {
    answer(true)
    renderManager()
    await userEvent.click(screen.getByRole('button', { name: banner.customize }))
    const dialog = screen.getByRole('dialog', { name: modal.title })
    const necessary = within(dialog).getByRole('switch', { name: modal.necessary })
    expect(necessary).toBeChecked()
    expect(necessary).toBeDisabled()
    const analytics = within(dialog).getByRole('switch', { name: modal.analytics })
    expect(analytics).not.toBeChecked()
    await userEvent.click(analytics)
    expect(analytics).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: modal.save }))
    expect(sentBodies()).toEqual([{ analytics: true }])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('region', { name: banner.label })).toBeNull()
  })

  it('"Sulje" leaves the stored choice alone', async () => {
    renderManager()
    await userEvent.click(screen.getByRole('button', { name: banner.customize }))
    const dialog = screen.getByRole('dialog', { name: modal.title })
    await userEvent.click(within(dialog).getByRole('switch', { name: modal.analytics }))
    await userEvent.click(within(dialog).getByRole('button', { name: modal.close }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('region', { name: banner.label })).toBeInTheDocument()
  })

  it('the footer "Evästeasetukset" reopens the modal with the stored choice', async () => {
    renderManager(createConsent(true))
    act(() => {
      window.dispatchEvent(new CustomEvent(COOKIE_SETTINGS_EVENT))
    })
    const dialog = await screen.findByRole('dialog', { name: modal.title })
    expect(within(dialog).getByRole('switch', { name: modal.analytics })).toBeChecked()
  })

  it('shows an error and keeps the banner when the save fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: false }, { status: 500 }))
    renderManager()
    await userEvent.click(screen.getByRole('button', { name: banner.acceptAll }))
    expect(await screen.findByRole('alert')).toHaveTextContent(fi.consent.saveFailed)
    expect(screen.getByRole('region', { name: banner.label })).toBeInTheDocument()
    expect(analyticsScripts()).toHaveLength(0)
  })
})
