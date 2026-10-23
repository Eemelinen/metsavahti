// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@/components/app-shell/app-shell'
import { activeSection, initials, pageTitle, unreadBadge } from '@/components/app-shell/nav'

const navigation = vi.hoisted(() => ({ pathname: '/dashboard' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

beforeAll(() => {
  // Radix measures the menu with ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  cleanup()
  navigation.pathname = '/dashboard'
})

const USER = { email: 'anna.korhonen@example.fi', name: 'Anna Korhonen' }

/** The `md` breakpoint of the theme (Tailwind's default 48rem). */
const MD = 768

/**
 * Whether `el` is displayed at `width`, read from the responsive utilities the shell uses
 * (`hidden`, `md:hidden`, `md:flex` / `md:inline` / `md:block`): jsdom applies no CSS, so the
 * two viewports are evaluated from the class contract that the stylesheet implements.
 */
function shownAt(el: HTMLElement, width: number): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const classes = node.classList
    const mdShown = ['md:flex', 'md:inline', 'md:block', 'md:grid'].some((c) => classes.contains(c))
    if (width >= MD && classes.contains('md:hidden')) return false
    if (classes.contains('hidden') && !(width >= MD && mdShown)) return false
  }
  return true
}

function renderShell(unreadCount = 3, pathname = '/dashboard') {
  navigation.pathname = pathname
  return render(
    <AppShell unreadCount={unreadCount} user={USER}>
      <h1>Vahtialueesi</h1>
    </AppShell>,
  )
}

describe.each([
  { viewport: 'mobile (Pixel 7, 412 px)', width: 412, mobile: true },
  { viewport: 'desktop (1280 px)', width: 1280, mobile: false },
])('AppShell at $viewport', ({ width, mobile }) => {
  it('shows the sidebar on desktop and the bottom tab bar on mobile', () => {
    renderShell()
    const sidebar = screen.getByTestId('app-nav-sidebar')
    const tabs = screen.getByTestId('app-nav-tabs')
    expect(shownAt(sidebar, width)).toBe(!mobile)
    expect(shownAt(tabs, width)).toBe(mobile)
    expect(tabs.className).toContain('fixed')
    expect(tabs.className).toContain('bottom-0')
  })

  it('shows the page title on desktop and the brand in the header on mobile', () => {
    renderShell(0, '/tili/turvallisuus')
    const header = screen.getByRole('banner')
    expect(shownAt(within(header).getByText('Turvallisuus'), width)).toBe(!mobile)
    expect(shownAt(within(header).getByRole('link', { name: 'Metsävahti' }), width)).toBe(mobile)
  })

  it('keeps the content, the account menu and the attribution visible', () => {
    renderShell()
    expect(shownAt(screen.getByRole('heading', { name: 'Vahtialueesi' }), width)).toBe(true)
    expect(shownAt(screen.getByTestId('account-menu-trigger'), width)).toBe(true)
    const attribution = screen.getByTestId('attribution')
    expect(attribution).toHaveTextContent(
      /Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa \d{2}\/\d{4}/,
    )
    expect(shownAt(attribution, width)).toBe(true)
  })

  it('shows the unread badge on Ilmoitukset in the visible navigation', () => {
    renderShell(3)
    const nav = screen.getByTestId(mobile ? 'app-nav-tabs' : 'app-nav-sidebar')
    const alerts = within(nav).getByRole('link', { name: /Ilmoitukset/ })
    expect(alerts).toHaveAttribute('href', '/ilmoitukset')
    expect(alerts).toHaveAccessibleName(/^Ilmoitukset ?\(3 lukematonta\)$/)
    expect(within(alerts).getByTestId('unread-badge')).toHaveTextContent('3')
  })
})

describe('AppNav', () => {
  it('lists Vahtialueet, Ilmoitukset and Tili in both navigations', () => {
    renderShell()
    for (const id of ['app-nav-sidebar', 'app-nav-tabs']) {
      const nav = within(screen.getByTestId(id))
      const links = ['Vahtialueet', /^Ilmoitukset ?\(3 lukematonta\)$/, 'Tili'].map((name) =>
        nav.getByRole('link', { name }),
      )
      expect(nav.getAllByRole('link')).toHaveLength(3)
      expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
        ['Vahtialueet', '/dashboard'],
        ['Ilmoitukset3 (3 lukematonta)', '/ilmoitukset'],
        ['Tili', '/tili'],
      ])
    }
  })

  it.each([
    ['/dashboard', 'Vahtialueet'],
    ['/vahtialueet/3/muokkaa', 'Vahtialueet'],
    ['/aloita', 'Vahtialueet'],
    ['/ilmoitukset/12', 'Ilmoitukset'],
    ['/tili/ilmoitukset', 'Tili'],
  ])('marks the section of %s as the current page', (pathname, label) => {
    renderShell(0, pathname)
    for (const id of ['app-nav-sidebar', 'app-nav-tabs']) {
      const current = within(screen.getByTestId(id)).getAllByRole('link', { current: 'page' })
      expect(current).toHaveLength(1)
      expect(current[0]).toHaveTextContent(label)
    }
  })

  it('shows no badge without unread alerts', () => {
    renderShell(0)
    expect(screen.queryByTestId('unread-badge')).toBeNull()
  })
})

describe('AccountMenu', () => {
  it('opens the address, Tili, Asetukset and Kirjaudu ulos; logout POSTs to /kirjaudu-ulos', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    const user = userEvent.setup()
    renderShell()
    const trigger = screen.getByRole('button', { name: `Tilivalikko: ${USER.email}` })
    expect(trigger).toHaveTextContent('AK')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    const menu = await screen.findByRole('menu')
    expect(menu).toHaveTextContent(USER.email)
    expect(within(menu).getByRole('menuitem', { name: 'Tili' })).toHaveAttribute('href', '/tili')
    expect(within(menu).getByRole('menuitem', { name: 'Asetukset' })).toHaveAttribute(
      'href',
      '/tili/ilmoitukset',
    )

    await user.click(within(menu).getByRole('menuitem', { name: 'Kirjaudu ulos' }))
    expect(submit).toHaveBeenCalledTimes(1)
    const form = submit.mock.contexts[0] as HTMLFormElement
    expect(form.getAttribute('action')).toBe('/kirjaudu-ulos')
    expect(form.getAttribute('method')).toBe('post')
    submit.mockRestore()
  })

  it('is left out while the page is redirecting a missing session', () => {
    render(
      <AppShell unreadCount={0} user={null}>
        <p>…</p>
      </AppShell>,
    )
    expect(screen.queryByTestId('account-menu-trigger')).toBeNull()
  })
})

describe('nav helpers', () => {
  it('derives the section and the header title from the path', () => {
    expect(activeSection('/dashboardx')).toBeNull()
    expect(activeSection('/tili-poistettu')).toBeNull()
    expect(pageTitle('/aloita')).toBe('Uusi vahtialue')
    expect(pageTitle('/vahtialueet/7')).toBe('Vahtialueet')
    expect(pageTitle('/tili')).toBe('Tili')
  })

  it('builds initials from the name, else the address', () => {
    expect(initials({ name: 'Anna Korhonen', email: 'a@x.fi' })).toBe('AK')
    expect(initials({ name: 'anna maria korhonen', email: 'a@x.fi' })).toBe('AK')
    expect(initials({ name: 'Åke', email: 'a@x.fi' })).toBe('Å')
    expect(initials({ name: '  ', email: 'eero@x.fi' })).toBe('E')
    expect(initials({ email: 'eero@x.fi' })).toBe('E')
  })

  it('caps the badge at 99+', () => {
    expect(unreadBadge(0)).toBeNull()
    expect(unreadBadge(7)).toBe('7')
    expect(unreadBadge(120)).toBe('99+')
  })
})
