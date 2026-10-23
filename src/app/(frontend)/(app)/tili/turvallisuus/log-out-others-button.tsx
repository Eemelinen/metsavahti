'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { fi } from '@/i18n/fi'

import { logOutOtherSessions } from './actions'

const copy = fi.account.sessions

/** "Kirjaa ulos muista laitteista": ends every other session, then refreshes the list. */
export function LogOutOthersButton() {
  const router = useRouter()
  const hydrated = useHydrated()
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ done: true } | { error: string } | null>(null)

  function onClick() {
    setStatus(null)
    startTransition(async () => {
      const result = await logOutOtherSessions()
      if (!result.ok) {
        setStatus({ error: result.error.message })
        return
      }
      setStatus({ done: true })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <FormSuccess>{status && 'done' in status ? copy.loggedOut : null}</FormSuccess>
      <FormError>{status && 'error' in status ? status.error : null}</FormError>
      <div>
        <Button
          className="h-11 px-4 font-semibold text-ember-700"
          data-hydrated={hydrated ? '' : undefined}
          disabled={pending}
          onClick={onClick}
          type="button"
          variant="outline"
        >
          {copy.logoutOthers}
        </Button>
      </div>
    </div>
  )
}
