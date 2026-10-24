'use client'

import { useCallback, useEffect, useState } from 'react'

import { ConsentBanner } from '@/components/consent/consent-banner'
import { ConsentModal } from '@/components/consent/consent-modal'
import { COOKIE_SETTINGS_EVENT } from '@/components/cookie-settings-button'
import { useHydrated } from '@/components/forms/use-hydrated'
import { fi } from '@/i18n/fi'
import type { CookieConsent } from '@/lib/consent/consent-cookie'

/** Marks the analytics `<script>` so it is added once and found again on withdrawal. */
const ANALYTICS_SCRIPT_ATTRIBUTE = 'data-analytics'

/**
 * Add the analytics script once the visitor has granted analytics. It is inserted from this
 * (nonce-trusted) bundle, which the CSP's `'strict-dynamic'` allows without a host allow-list.
 */
function useAnalyticsScript(src: string | undefined, granted: boolean) {
  useEffect(() => {
    if (!src || !granted) return
    if (document.querySelector(`script[${ANALYTICS_SCRIPT_ATTRIBUTE}]`)) return
    const script = document.createElement('script')
    script.src = src
    script.defer = true
    script.setAttribute(ANALYTICS_SCRIPT_ATTRIBUTE, '')
    document.head.appendChild(script)
  }, [src, granted])
}

async function postConsent(analytics: boolean): Promise<CookieConsent> {
  const response = await fetch('/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ analytics }),
  })
  if (!response.ok) throw new Error(`POST /api/consent answered ${response.status}`)
  const body = (await response.json()) as { consent: CookieConsent }
  return body.consent
}

/**
 * Cookie consent for every frontend page (MV-090, `01 §8`): the banner until a choice is
 * stored, the modal from "Mukauta" or the footer's "Evästeasetukset"
 * (`COOKIE_SETTINGS_EVENT`), and the analytics script only while analytics is granted. The
 * frontend layout reads `mv_consent` on the server and passes it in, so a returning visitor
 * never sees the banner flash. Choices go through `POST /api/consent`, which sets the cookie
 * and records the event for a signed-in account.
 *
 * Withdrawing analytics after its script has run reloads the page: a loaded script cannot be
 * unloaded, and the reload renders without it.
 */
export function ConsentManager({
  initialConsent,
  analyticsScriptUrl,
}: {
  initialConsent: CookieConsent | null
  analyticsScriptUrl?: string
}) {
  const hydrated = useHydrated()
  const [consent, setConsent] = useState(initialConsent)
  const [modalOpen, setModalOpen] = useState(false)
  const [draftAnalytics, setDraftAnalytics] = useState(initialConsent?.analytics ?? false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useAnalyticsScript(analyticsScriptUrl, consent?.analytics === true)

  const openModal = useCallback(() => {
    setDraftAnalytics(consent?.analytics ?? false)
    setError(null)
    setModalOpen(true)
  }, [consent])

  useEffect(() => {
    window.addEventListener(COOKIE_SETTINGS_EVENT, openModal)
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, openModal)
  }, [openModal])

  async function save(analytics: boolean) {
    setPending(true)
    setError(null)
    try {
      const saved = await postConsent(analytics)
      const withdrawn = consent?.analytics === true && !saved.analytics
      setConsent(saved)
      setModalOpen(false)
      if (withdrawn && document.querySelector(`script[${ANALYTICS_SCRIPT_ATTRIBUTE}]`)) {
        window.location.reload()
      }
    } catch {
      setError(fi.consent.saveFailed)
    } finally {
      setPending(false)
    }
  }

  return (
    <div data-hydrated={hydrated ? '' : undefined} data-testid="consent">
      {consent === null && (
        <ConsentBanner
          error={modalOpen ? null : error}
          pending={pending}
          onAcceptAll={() => void save(true)}
          onCustomize={openModal}
          onNecessaryOnly={() => void save(false)}
        />
      )}
      <ConsentModal
        analytics={draftAnalytics}
        error={modalOpen ? error : null}
        open={modalOpen}
        pending={pending}
        onAnalyticsChange={setDraftAnalytics}
        onOpenChange={setModalOpen}
        onSave={() => void save(draftAnalytics)}
      />
    </div>
  )
}
