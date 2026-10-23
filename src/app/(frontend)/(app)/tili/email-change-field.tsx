'use client'

import { useRouter } from 'next/navigation'
import { type KeyboardEvent, useState, useTransition } from 'react'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'

import { changeEmail } from './actions'

const copy = fi.account.profile

type Status = { sent: true } | { fieldError: string } | { error: string } | null

/**
 * The address row of the `/tili` card (App artboard `tili`): the current address is editable,
 * "Vaihda" sends the confirmation link to what is typed there (Server Action `changeEmail`,
 * MV-052). It lives inside the profile form but is not part of it: the profile's "Tallenna"
 * never sends the address, and Enter in this field means "Vaihda". A pending change is named
 * under the field until the link is opened.
 */
export function EmailChangeField({
  email,
  pendingEmail,
}: {
  email: string
  pendingEmail: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(email)
  const [status, setStatus] = useState<Status>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setStatus(null)
    startTransition(async () => {
      const result = await changeEmail({ email: value })
      if (result.fieldErrors) {
        setStatus({ fieldError: result.fieldErrors.email ?? copy.errors.emailInvalid })
      } else if (result.error) {
        setStatus({ error: result.error.message })
      } else {
        setStatus({ sent: true })
        router.refresh()
      }
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  const fieldError = status && 'fieldError' in status ? status.fieldError : undefined
  const describedBy = ['email-hint', fieldError ? 'email-error' : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1.5" data-testid="email-change">
      <Label htmlFor="email">{copy.email}</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-describedby={describedBy}
          aria-invalid={fieldError ? true : undefined}
          autoComplete="email"
          className="min-w-50 flex-1"
          id="email"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          type="email"
          value={value}
        />
        <Button
          className="h-12 px-3.5 font-semibold"
          disabled={pending}
          onClick={submit}
          type="button"
          variant="outline"
        >
          {copy.changeEmail}
        </Button>
      </div>
      {fieldError ? (
        <p className="text-sm text-error" id="email-error" role="alert">
          {fieldError}
        </p>
      ) : null}
      <p className="text-sm text-ink-muted" id="email-hint">
        {pendingEmail ? copy.emailPending(pendingEmail) : copy.emailHint}
      </p>
      <FormSuccess>{status && 'sent' in status ? copy.emailChangeSent : null}</FormSuccess>
      <FormError>{status && 'error' in status ? status.error : null}</FormError>
    </div>
  )
}
