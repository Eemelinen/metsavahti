import type { Metadata } from 'next'
import Link from 'next/link'

import { GoBackButton } from '@/components/go-back-button'
import { SystemPage, systemAction } from '@/components/system-page'

export const metadata: Metadata = { title: 'Liian monta pyyntöä', robots: { index: false } }

/**
 * Rate-limit page (docs/design/App.dc.html#route=rajoitus). The rate limiter (MV-048)
 * redirects form posts here; "Yritä uudelleen" returns to the form.
 */
export default function TooManyRequestsPage() {
  return (
    <SystemPage
      code="429"
      title="Liian monta pyyntöä"
      actions={
        <>
          <GoBackButton className={systemAction.primary}>Yritä uudelleen</GoBackButton>
          <Link className={systemAction.link} href="/">
            Etusivulle
          </Link>
        </>
      }
    >
      Odota hetki ja yritä uudelleen.
    </SystemPage>
  )
}
