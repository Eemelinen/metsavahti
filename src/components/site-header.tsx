import Link from 'next/link'

import { BrandMark } from '@/components/brand-mark'
import { marketingNavLinks } from '@/lib/marketing/routes'

/**
 * Marketing header (docs/design/Landing.dc.html#header-footer): logo, section links, login
 * and the "Luo tili" pill. "Hinnoittelu" is listed only when `showPricing` is set: the server
 * layouts pass `SHOW_PRICING` (MV-101); the client error boundaries cannot read it and leave the
 * link out.
 */
export function SiteHeader({ showPricing = false }: { showPricing?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-5 py-3.5">
        <BrandMark />
        <nav aria-label="Päävalikko" className="ml-auto">
          <ul className="flex flex-wrap items-center gap-5 text-base font-medium">
            {marketingNavLinks(showPricing).map((link) => (
              <li key={link.href}>
                <Link className="text-ink hover:text-forest-700 hover:underline" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                className="inline-flex items-center rounded-full bg-forest-700 px-4.5 py-2.5 font-semibold text-white transition-colors hover:bg-forest-600"
                href="/rekisteroidy"
              >
                Luo tili
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
