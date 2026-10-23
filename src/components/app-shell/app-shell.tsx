import type { ReactNode } from 'react'

import { AccountMenu } from '@/components/app-shell/account-menu'
import { AppNav, AppPageTitle } from '@/components/app-shell/app-nav'
import { initials } from '@/components/app-shell/nav'
import { Attribution } from '@/components/attribution'
import { BrandMark } from '@/components/brand-mark'
import { LegalNav } from '@/components/site-footer'
import { fi } from '@/i18n/fi'

export interface AppShellUser {
  email: string
  name?: string | null
}

/**
 * Logged-in frame (03-pages.md `AppLayout`, docs/design/App.dc.html app layout): from `md` up a
 * 232 px sidebar with the brand and the sections, below `md` a bottom tab bar; a sticky header
 * with the page title (desktop) or the brand (mobile) and the account menu; the compact footer
 * with the Metsäkeskus attribution (AGENTS.md licence rule) at the end of the content column.
 *
 * `user` is `null` only while a page is about to redirect (guest, unverified): the frame then
 * renders without the account menu rather than failing.
 */
export function AppShell({
  user,
  unreadCount,
  children,
}: {
  user: AppShellUser | null
  unreadCount: number
  children: ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-1">
      <aside className="sticky top-0 hidden h-svh w-58 flex-none flex-col gap-1.5 border-r border-line bg-paper-raised px-3.5 py-5 md:flex">
        <BrandMark className="px-2.5 pt-1 pb-4.5" />
        <AppNav unreadCount={unreadCount} variant="sidebar" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-18 md:pb-0">
        <header className="sticky top-0 z-20 flex min-h-15 items-center gap-3 border-b border-line bg-paper/90 px-5 py-3 backdrop-blur">
          <BrandMark className="text-lg md:hidden" />
          <AppPageTitle className="hidden text-sm font-semibold text-ink-muted md:inline" />
          {user ? (
            <div className="ml-auto">
              <AccountMenu email={user.email} initials={initials(user)} />
            </div>
          ) : null}
        </header>

        <main className="flex w-full max-w-6xl flex-1 flex-col px-5 py-6 md:px-8">{children}</main>

        <footer className="border-t border-line px-5 py-5 text-xs text-ink-muted md:px-8">
          <LegalNav className="mb-1.5" listClassName="flex flex-wrap gap-x-3.5 gap-y-1.5" />
          <Attribution />
          <p>
            {fi.footer.mapCredit} {fi.footer.copyright(new Date().getFullYear())}
          </p>
        </footer>
      </div>

      <AppNav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper-raised px-2 pt-1.5 pb-2.5 md:hidden"
        unreadCount={unreadCount}
        variant="tabs"
      />
    </div>
  )
}
