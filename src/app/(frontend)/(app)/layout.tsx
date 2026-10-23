import type { ReactNode } from 'react'
import { getPayload } from 'payload'

import config from '@payload-config'
import { AppShell } from '@/components/app-shell/app-shell'
import { countUnreadAlerts } from '@/lib/alerts/unread'
import { getSessionUser } from '@/lib/auth/guards'

/**
 * `(app)` layout (E04 MV-050): sidebar on desktop, bottom tabs on mobile, account menu and the
 * unread-alert badge (`AppShell`).
 *
 * No session check here: a layout does not re-render on client-side navigation, so every
 * `(app)` page starts with `requireUser({ next })` (`lib/auth/guards.ts`), which also sends an
 * unverified session to `/vahvista-sahkoposti` (MV-043). `src/proxy.ts` has already sent
 * requests without a signed session cookie to `/kirjaudu?next=` (MV-046, D-020). The layout
 * only reads the same per-request session for the menu and the badge.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  const unreadCount = user ? await countUnreadAlerts(await getPayload({ config }), user) : 0

  return (
    <AppShell unreadCount={unreadCount} user={user}>
      {children}
    </AppShell>
  )
}
