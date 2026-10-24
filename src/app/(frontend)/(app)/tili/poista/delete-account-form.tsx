'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { FormError } from '@/components/forms/form-error'
import { PasswordInput } from '@/components/forms/password-input'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'
import {
  ACCOUNT_DELETED_PATH,
  DELETE_ACCOUNT_CONFIRMATION,
  type DeleteAccountField,
  type DeleteAccountFieldErrors,
  type DeleteAccountFormValues,
  deleteAccountFormSchema,
} from '@/lib/account/account-schema'

const copy = fi.account.deleteAccount
const EMPTY: DeleteAccountFormValues = { confirm: '', password: '' }

type DeleteResponse = {
  ok?: boolean
  data?: { redirect?: string }
  fieldErrors?: DeleteAccountFieldErrors
  error?: { message?: string }
}

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p className="text-sm text-error" id={id} role="alert">
      {children}
    </p>
  )
}

/**
 * "Kirjoita POISTA vahvistukseksi" + "Salasana" (App artboard `poista`). The button stays
 * disabled until `POISTA` is typed and a password given, as on the artboard; the server checks
 * both again and answers a wrong password with a field error. Success is a full page load of
 * `/tili-poistettu`, so nothing of the signed-in app stays in the client's router cache.
 */
export function DeleteAccountForm() {
  const hydrated = useHydrated()
  const [error, setFormError] = useState<string | null>(null)
  // Set once the account is gone and the browser is on its way to `/tili-poistettu`.
  const [leaving, setLeaving] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountFormSchema),
    defaultValues: EMPTY,
  })
  const [confirm, password] = useWatch({ control, name: ['confirm', 'password'] })
  const ready = confirm.trim() === DELETE_ACCOUNT_CONFIRMATION && password.length > 0

  async function onSubmit(values: DeleteAccountFormValues) {
    setFormError(null)
    let response: Response
    let body: DeleteResponse | null
    try {
      response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      body = (await response.json().catch(() => null)) as DeleteResponse | null
    } catch {
      setFormError(copy.errors.failed)
      return
    }
    if (body?.fieldErrors) {
      for (const [field, message] of Object.entries(body.fieldErrors)) {
        setError(field as DeleteAccountField, { type: 'server', message })
      }
      return
    }
    if (!response.ok || !body?.ok) {
      setFormError(body?.error?.message ?? copy.errors.failed)
      return
    }
    setLeaving(true)
    window.location.assign(body.data?.redirect ?? ACCOUNT_DELETED_PATH)
  }

  return (
    <form
      aria-labelledby="delete-account-title"
      className="flex flex-col gap-3.5"
      data-hydrated={hydrated ? '' : undefined}
      data-testid="delete-account-form"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormError>{error}</FormError>
      <div className="flex flex-col gap-1.5">
        <Label className="font-semibold" htmlFor="confirm">
          <span>
            {copy.confirmBefore} <span className="font-mono">{copy.confirmWord}</span>{' '}
            {copy.confirmAfter}
          </span>
        </Label>
        <Input
          aria-describedby={errors.confirm ? 'confirm-error' : undefined}
          aria-invalid={errors.confirm ? true : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          id="confirm"
          spellCheck={false}
          type="text"
          {...register('confirm')}
        />
        <FieldError id="confirm-error">{errors.confirm?.message}</FieldError>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="font-semibold" htmlFor="password">
          {copy.password}
        </Label>
        <PasswordInput
          aria-describedby={errors.password ? 'password-error' : undefined}
          aria-invalid={errors.password ? true : undefined}
          autoComplete="current-password"
          id="password"
          {...register('password')}
        />
        <FieldError id="password-error">{errors.password?.message}</FieldError>
      </div>
      <div>
        <Button
          className="h-11 bg-error px-5 text-base font-semibold text-white hover:bg-ember-700"
          disabled={!ready || isSubmitting || leaving}
          type="submit"
        >
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
