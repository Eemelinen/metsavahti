import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import type { ReactNode } from 'react'

import config from '@payload-config'
import { SiteFrame } from '@/components/site-frame'
import { findUnverifiedSessionUser } from '@/lib/auth/session'
import { verificationRequiredPath } from '@/lib/auth/verification'

/**
 * Stand-in for the app shell (sidebar / bottom tabs, MV-050). Until it lands, the logged-in
 * pages keep the marketing frame so the header and the attribution footer stay visible.
 *
 * An unverified session is sent to `/vahvista-sahkoposti` here (`01 §7`, E03 MV-043):
 * Payload's Local API cannot run in `proxy.ts`, and `payload.auth()` treats such a session
 * as a guest, so the pages themselves would only ever see "not logged in". MV-046 moves
 * the guard into the route-protection proxy together with the login redirect.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const payload = await getPayload({ config })
  const unverified = await findUnverifiedSessionUser(payload, await headers())
  if (unverified) redirect(verificationRequiredPath(unverified.email))
  return <SiteFrame>{children}</SiteFrame>
}
