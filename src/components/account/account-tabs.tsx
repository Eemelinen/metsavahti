'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from 'cn'

import { fi } from '@/i18n/fi'

/** The account pages' tab row (App artboard `tiliTabs`), in the artboard's order. */
export const ACCOUNT_TABS = [
  { href: '/tili', label: fi.account.tabs.profile },
  { href: '/tili/turvallisuus', label: fi.account.tabs.security },
  { href: '/tili/ilmoitukset', label: fi.account.tabs.notifications },
  { href: '/tili/tietosuoja', label: fi.account.tabs.privacy },
  { href: '/tili/poista', label: fi.account.tabs.deleteAccount },
] as const

export function AccountTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label={fi.account.tabs.label} className="overflow-x-auto border-b border-line">
      <ul className="flex gap-1">
        {ACCOUNT_TABS.map((tab) => {
          const current = pathname === tab.href
          return (
            <li className="flex-none" key={tab.href}>
              <Link
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px block border-b-2 px-3 py-2.5 text-base font-semibold whitespace-nowrap transition-colors hover:text-forest-700',
                  current
                    ? 'border-forest-700 text-forest-700'
                    : 'border-transparent text-ink-muted',
                )}
                href={tab.href}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
