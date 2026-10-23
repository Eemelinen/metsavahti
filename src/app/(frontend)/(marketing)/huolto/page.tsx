import type { Metadata } from 'next'
import Link from 'next/link'

import { SystemPage, systemAction } from '@/components/system-page'
import { env } from '@/lib/env'

export const metadata: Metadata = { title: 'Huoltotauko', robots: { index: false } }

/**
 * Maintenance page (docs/design/App.dc.html#route=huolto). `src/proxy.ts` sends every page
 * request here while `MAINTENANCE_MODE=1`, so "Yritä uudelleen" simply goes home. The return
 * time is `MAINTENANCE_RETURN_TIME` (the artboard shows "07.00"); without it the page only
 * promises "pian".
 */
export default function MaintenancePage() {
  const returnTime = env.MAINTENANCE_RETURN_TIME
  return (
    <SystemPage
      code="HUOLTO"
      title="Metsävahti on huoltotauolla"
      actions={
        <Link className={systemAction.primary} href="/">
          Yritä uudelleen
        </Link>
      }
    >
      {returnTime ? `Palaamme noin klo ${returnTime}.` : 'Palaamme pian.'} Sähköposti-ilmoitukset
      lähetetään huollon jälkeen normaalisti.
    </SystemPage>
  )
}
