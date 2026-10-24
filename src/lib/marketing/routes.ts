/**
 * Marketing routes that depend on a feature flag (MV-101). `/hinnoittelu` exists only with
 * `SHOW_PRICING=1`: the page answers 404 without it, and the header and `sitemap.xml` leave it
 * out, so no link points at a missing page. Pure so the unit test can cover both states.
 */
export const PRICING_PATH = '/hinnoittelu'

type NavLink = { href: string; label: string }

/** Header links (docs/design/Landing.dc.html#header-footer); "Luo tili" is the separate pill. */
const NAV_LINKS: readonly NavLink[] = [
  { href: '/miten-se-toimii', label: 'Miten se toimii' },
  { href: PRICING_PATH, label: 'Hinnoittelu' },
  { href: '/kirjaudu', label: 'Kirjaudu' },
]

export function marketingNavLinks(showPricing: boolean): readonly NavLink[] {
  return showPricing ? NAV_LINKS : NAV_LINKS.filter((link) => link.href !== PRICING_PATH)
}
