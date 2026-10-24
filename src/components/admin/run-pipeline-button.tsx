'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { fi } from '@/i18n/fi'

const t = fi.admin.runPipeline

/**
 * Admin "Run pipeline now" (MV-070), above the `job-runs` list. Posts to `/api/jobs/run` with
 * the admin's session cookie (the route accepts an admin as well as the cron secret), waits for
 * the run and refreshes the list so the new rows show. Only admins reach the admin panel.
 */
export function RunPipelineButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    try {
      const res = await fetch('/api/jobs/run', { method: 'POST', credentials: 'same-origin' })
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null
      if (res.ok && body?.ok) toast.success(t.succeeded)
      else toast.error(t.failed)
    } catch {
      toast.error(t.failed)
    } finally {
      setRunning(false)
      router.refresh()
    }
  }

  return (
    <Button buttonStyle="primary" disabled={running} onClick={run}>
      {running ? t.running : t.button}
    </Button>
  )
}
