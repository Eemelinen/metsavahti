import Link from 'next/link'

import { Attribution } from '@/components/attribution'
import { CookieSettingsButton } from '@/components/cookie-settings-button'

/** Legal routes from 03-pages.md → (legal); the pages themselves arrive with MV-091/MV-095. */
const legalLinks = [
  { href: '/tietosuoja', label: 'Tietosuojaseloste' },
  { href: '/kayttoehdot', label: 'Käyttöehdot' },
  { href: '/evasteet', label: 'Evästeet' },
  { href: '/saavutettavuus', label: 'Saavutettavuusseloste' },
  { href: '/yhteystiedot', label: 'Yhteystiedot' },
] as const

const footerLinkClass = 'text-forest-600 hover:text-forest-700 hover:underline'

/**
 * Site footer (docs/design/Landing.dc.html#header-footer): legal links, the cookie-settings
 * button, the Metsäkeskus attribution (licence term, see AGENTS.md) and the map credit.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-paper-sunken">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm text-ink-muted">
        <nav aria-label="Oikeudelliset tiedot">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link className={footerLinkClass} href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <CookieSettingsButton className={footerLinkClass} />
            </li>
          </ul>
        </nav>
        <div className="space-y-1">
          <Attribution />
          <p>Kartta © OpenStreetMapin tekijät, Maanmittauslaitos.</p>
        </div>
        <p>© {new Date().getFullYear()} Metsävahti</p>
      </div>
    </footer>
  )
}
