import { fi } from '@/i18n/fi'

/**
 * Sections of the logged-in app (03b-ui-design-brief.md "App pages": Vahtialueet · Ilmoitukset
 * · Tili; docs/design/App.dc.html `navItems`). Shared by the desktop sidebar and the mobile tab
 * bar so both always agree on targets, labels and the active section.
 *
 * Vahtialueet points at `/dashboard`, today's watch-area page, until MV-066 builds
 * `/vahtialueet` (00-deviations R19, R20); both paths mark the section active.
 */
export type AppSection = 'vahtialueet' | 'ilmoitukset' | 'tili'

export interface AppNavItem {
  section: AppSection
  href: string
  label: string
  /** Path prefixes that belong to the section (`03-pages.md` `(app)` routes). */
  prefixes: readonly string[]
}

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  {
    section: 'vahtialueet',
    href: '/dashboard',
    label: fi.app.nav.watchAreas,
    prefixes: ['/dashboard', '/vahtialueet', '/aloita'],
  },
  {
    section: 'ilmoitukset',
    href: '/ilmoitukset',
    label: fi.app.nav.alerts,
    prefixes: ['/ilmoitukset'],
  },
  { section: 'tili', href: '/tili', label: fi.app.nav.account, prefixes: ['/tili'] },
]

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** The section a path belongs to, or `null` outside the app sections. */
export function activeSection(pathname: string): AppSection | null {
  return (
    APP_NAV_ITEMS.find((item) => item.prefixes.some((p) => matchesPrefix(pathname, p)))?.section ??
    null
  )
}

/** Header titles of the artboard (`titles` in App.dc.html), longest prefix first. */
const PAGE_TITLES: ReadonlyArray<readonly [prefix: string, title: string]> = [
  ['/vahtialueet/uusi', fi.app.titles.newWatchArea],
  ['/aloita', fi.app.titles.newWatchArea],
  ['/tili/turvallisuus', fi.app.titles.security],
  ['/tili/ilmoitukset', fi.app.titles.notificationSettings],
  ['/tili/tietosuoja', fi.app.titles.privacy],
  ['/tili/poista', fi.app.titles.deleteAccount],
]

/** The desktop header's page title: a known sub-page, else the section's label. */
export function pageTitle(pathname: string): string {
  const exact = PAGE_TITLES.find(([prefix]) => matchesPrefix(pathname, prefix))
  if (exact) return exact[1]
  const section = activeSection(pathname)
  return APP_NAV_ITEMS.find((item) => item.section === section)?.label ?? fi.brand.name
}

/**
 * Initials for the account button ("Anna Korhonen" → "AK"): the first letters of the first and
 * last word of the name, else the first letter of the address.
 */
export function initials(user: { name?: string | null; email: string }): string {
  const words = (user.name ?? '').trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length === 0
      ? [user.email.charAt(0)]
      : words.length === 1
        ? [words[0]!.charAt(0)]
        : [words[0]!.charAt(0), words.at(-1)!.charAt(0)]
  return letters.join('').toLocaleUpperCase('fi-FI')
}

/** Badge text: nothing at 0, the count up to 99, then "99+". */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null
  return count > 99 ? '99+' : String(count)
}
