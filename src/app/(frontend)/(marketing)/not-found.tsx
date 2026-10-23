import Link from 'next/link'

import { SystemPage, systemAction } from '@/components/system-page'

/**
 * 404 (docs/design/App.dc.html#route=404). Reached through `notFound()` and, via the
 * `[...notFound]` catch-all, for every URL no other route matches (docs/DECISIONS.md D-010).
 */
export default function NotFound() {
  return (
    <SystemPage
      code="404"
      title="Sivua ei löytynyt"
      actions={
        <>
          <Link className={systemAction.primary} href="/">
            Etusivulle
          </Link>
          <Link className={systemAction.link} href="/dashboard">
            Vahtialueisiin
          </Link>
        </>
      }
    >
      Osoite saattaa olla vanhentunut tai kirjoitettu väärin.
    </SystemPage>
  )
}
