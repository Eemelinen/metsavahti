import type { Metadata } from 'next'

import { fi } from '@/i18n/fi'
import { requireUser } from '@/lib/auth/guards'

export const metadata: Metadata = { title: fi.app.nav.alerts }

/**
 * Stand-in for `/ilmoitukset` so the app navigation has a target (MV-050); MV-080 replaces it
 * with the real page (00-deviations R20).
 */
export default async function IlmoituksetPage() {
  await requireUser({ next: '/ilmoitukset' })
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{fi.app.nav.alerts}</h1>
      <p className="text-ink-muted">{fi.app.comingSoon}</p>
    </div>
  )
}
