'use client'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { SystemPage, systemAction } from '@/components/system-page'

/** Props Next passes to `error.tsx` / `global-error.tsx`. */
export type ErrorBoundaryProps = {
  error: Error & { digest?: string }
  retry: () => void
}

/**
 * "Jotain meni pieleen" (docs/design/App.dc.html#route=500). Reports the error to Sentry and
 * shows the event id so the user can quote it; without a DSN the id is generated locally
 * and only Next's `digest` links it to the server log.
 */
export function ErrorState({ error, retry }: ErrorBoundaryProps) {
  const [eventId, setEventId] = useState<string>()

  useEffect(() => {
    // The id exists only once the SDK has been told about the error, so it has to be stored
    // from the effect that reports it; a single render follows, there is no cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEventId(Sentry.captureException(error))
  }, [error])

  return (
    <SystemPage
      code="500"
      title="Jotain meni pieleen"
      actions={
        <>
          <button className={systemAction.primary} type="button" onClick={() => retry()}>
            Yritä uudelleen
          </button>
          <Link className={systemAction.link} href="/">
            Etusivulle
          </Link>
        </>
      }
      details={eventId ? <>Virhetunnus: {eventId}</> : null}
    >
      Palvelussa tapahtui virhe. Yritä hetken päästä uudelleen. Vahtialueesi seuranta jatkuu
      normaalisti.
    </SystemPage>
  )
}
