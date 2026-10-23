import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site-frame'

/**
 * Stand-in for the app shell (sidebar / bottom tabs, MV-050). Until it lands, the logged-in
 * pages keep the marketing frame so the header and the attribution footer stay visible.
 *
 * No session check here: a layout does not re-render on client-side navigation, so every
 * `(app)` page starts with `requireUser({ next })` (`lib/auth/guards.ts`), which also sends an
 * unverified session to `/vahvista-sahkoposti` (MV-043). `src/proxy.ts` has already sent
 * requests without a signed session cookie to `/kirjaudu?next=` (MV-046, D-020).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>
}
