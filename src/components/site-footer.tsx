import Link from 'next/link'

import { Attribution } from '@/components/attribution'
import { CookieSettingsButton } from '@/components/cookie-settings-button'
import { fi } from '@/i18n/fi'

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
 * Legal links + "Evästeasetukset", shared by `SiteFooter` and the app shell's compact footer
 * (MV-050) so the two cannot drift apart.
 */
export function LegalNav({
  className,
  listClassName,
}: {
  className?: string
  listClassName: string
}) {
  return (
    <nav aria-label={fi.footer.legalNav} className={className}>
      <ul className={listClassName}>
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
  )
}

/**
 * Site footer (docs/design/Landing.dc.html#header-footer): legal links, the cookie-settings
 * button, the Metsäkeskus attribution (licence term, see AGENTS.md) and the map credit.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-paper-sunken">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 text-sm text-ink-muted">
        <LegalNav listClassName="flex flex-wrap gap-x-5 gap-y-2" />
        <div className="space-y-1">
          <Attribution />
          <p>{fi.footer.mapCredit}</p>
        </div>
        <p>{fi.footer.copyright(new Date().getFullYear())}</p>
      </div>
    </footer>
  )
}
