'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { fi } from '@/i18n/fi'
import type { DataExportState } from '@/lib/account/data-export'

const copy = fi.account.privacy.export

export type ExportSectionProps = {
  status: DataExportState['status']
  email: string
  /** Formatted in the account's time zone; set while pending or ready. */
  expiresAt: string | null
  downloadUrl: string | null
  /** Formatted; set while a new request would be refused. */
  nextAllowedAt: string | null
}

/**
 * The export states of `/tili/tietosuoja` (App artboard `tietosuoja`): the "Lataa tietoni"
 * button, "Valmistellaan…" while the job runs, the ready link, and a note after an expired or
 * failed export. The button posts to `POST /api/account/export` and refreshes the page.
 */
export function ExportSection({
  status,
  email,
  expiresAt,
  downloadUrl,
  nextAllowedAt,
}: ExportSectionProps) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, startTransition] = useTransition()
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/account/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean
          error?: { message?: string }
        } | null
        if (!response.ok || !body?.ok) {
          setError(body?.error?.message ?? copy.error)
          return
        }
        setRequested(true)
        router.refresh()
      } catch {
        setError(copy.error)
      }
    })
  }

  if (status === 'pending' || requested) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-lg bg-forest-50 px-3.5 py-3 text-sm text-forest-700"
        data-status="pending"
        data-testid="data-export"
        role="status"
      >
        <span
          aria-hidden="true"
          className="size-4 flex-none animate-spin rounded-full border-2 border-line-strong border-t-forest-700 motion-reduce:animate-none"
        />
        {copy.pending}
      </div>
    )
  }

  if (status === 'ready' && downloadUrl && expiresAt) {
    return (
      <div className="flex flex-col gap-3" data-status="ready" data-testid="data-export">
        <FormSuccess>{copy.ready(email, expiresAt)}</FormSuccess>
        <div>
          <a
            className="inline-flex h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold text-forest-700 hover:bg-forest-50"
            download
            href={downloadUrl}
          >
            {copy.download}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-status={status} data-testid="data-export">
      {status === 'expired' ? <p className="text-sm text-ink-muted">{copy.expired}</p> : null}
      <FormError>{status === 'failed' && !error ? copy.failed : error}</FormError>
      {nextAllowedAt ? (
        <p className="text-sm text-ink-muted">{copy.limited(nextAllowedAt)}</p>
      ) : (
        <div>
          <Button
            data-hydrated={hydrated ? '' : undefined}
            disabled={pending}
            onClick={onClick}
            size="xl"
            type="button"
          >
            {copy.request}
          </Button>
        </div>
      )}
    </div>
  )
}
