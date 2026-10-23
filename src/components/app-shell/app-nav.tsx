'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from 'cn'

import { APP_NAV_ITEMS, activeSection, pageTitle, unreadBadge } from '@/components/app-shell/nav'
import { fi } from '@/i18n/fi'

/**
 * The app's main navigation (docs/design/App.dc.html app layout): `sidebar` is the desktop
 * column, `tabs` the mobile bottom tab bar. The layout renders both; CSS shows one per
 * viewport (`md` breakpoint), so the server markup is the same for every device and nothing
 * shifts after hydration. The unread badge sits on Ilmoitukset.
 */
export function AppNav({
  variant,
  unreadCount,
  className,
}: {
  variant: 'sidebar' | 'tabs'
  unreadCount: number
  className?: string
}) {
  const current = activeSection(usePathname())
  const badge = unreadBadge(unreadCount)
  const sidebar = variant === 'sidebar'

  return (
    <nav aria-label={fi.app.nav.label} className={className} data-testid={`app-nav-${variant}`}>
      <ul className={sidebar ? 'flex flex-col gap-1.5' : 'grid grid-cols-3'}>
        {APP_NAV_ITEMS.map((item) => {
          const isCurrent = item.section === current
          const itemBadge = item.section === 'ilmoitukset' ? badge : null
          return (
            <li key={item.section}>
              <Link
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'font-semibold transition-colors',
                  sidebar
                    ? 'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-base'
                    : 'relative flex min-h-13 flex-col items-center gap-1 px-1 py-2 text-xs',
                  isCurrent ? 'text-forest-700' : 'text-ink-muted hover:text-forest-700',
                  sidebar && (isCurrent ? 'bg-forest-50' : 'hover:bg-paper-sunken'),
                )}
                href={item.href}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    sidebar ? 'size-2 rounded-full' : 'h-1.5 w-7 rounded-sm',
                    isCurrent ? 'bg-forest-600' : 'bg-sage-300',
                  )}
                />
                {item.label}
                {itemBadge ? (
                  <span
                    className={cn(
                      'rounded-full bg-amber-700 font-semibold text-white',
                      sidebar
                        ? 'ml-auto px-2 py-0.5 text-xs'
                        : 'absolute top-0.5 left-1/2 ml-2 px-1.5 text-xs',
                    )}
                    data-testid="unread-badge"
                  >
                    <span aria-hidden="true">{itemBadge}</span>
                    <span className="sr-only"> {fi.app.nav.unread(itemBadge)}</span>
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** The desktop header's title for the current page (the artboard's `pageTitle`). */
export function AppPageTitle({ className }: { className?: string }) {
  return <span className={className}>{pageTitle(usePathname())}</span>
}
