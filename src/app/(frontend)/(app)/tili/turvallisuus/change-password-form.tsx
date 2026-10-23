'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { PasswordInput } from '@/components/forms/password-input'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'
import {
  type ChangePasswordField,
  type ChangePasswordFormValues,
  changePasswordFormSchema,
} from '@/lib/account/account-schema'
import { passwordUserInputs } from '@/lib/auth/registration-schema'

import { changePassword } from './actions'

const copy = fi.account.password
const EMPTY: ChangePasswordFormValues = { currentPassword: '', newPassword: '' }

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p className="text-sm text-error" id={id} role="alert">
      {children}
    </p>
  )
}

/**
 * "Vaihda salasana" (App artboard `turvallisuus`): the current password and the new one with
 * the strength meter. Success clears the fields and refreshes the page, whose session list then
 * shows only this device.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [status, setStatus] = useState<{ changed: true } | { error: string } | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: EMPTY,
  })

  async function onSubmit(values: ChangePasswordFormValues) {
    setStatus(null)
    const result = await changePassword(values)
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as ChangePasswordField, { type: 'server', message })
      }
      return
    }
    if (result.error) {
      setStatus({ error: result.error.message })
      return
    }
    reset(EMPTY)
    setStatus({ changed: true })
    router.refresh()
  }

  return (
    <form
      aria-labelledby="change-password-title"
      className="flex flex-col gap-3.5 rounded-xl border border-line bg-paper-raised p-5"
      data-hydrated={hydrated ? '' : undefined}
      data-testid="change-password-form"
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <h2 className="text-lg font-semibold text-forest-700" id="change-password-title">
        {copy.title}
      </h2>
      <FormSuccess>{status && 'changed' in status ? copy.changed : null}</FormSuccess>
      <FormError>{status && 'error' in status ? status.error : null}</FormError>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">{copy.current}</Label>
        <PasswordInput
          aria-describedby={errors.currentPassword ? 'currentPassword-error' : undefined}
          aria-invalid={errors.currentPassword ? true : undefined}
          autoComplete="current-password"
          id="currentPassword"
          {...register('currentPassword')}
        />
        <FieldError id="currentPassword-error">{errors.currentPassword?.message}</FieldError>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">{copy.next}</Label>
        <PasswordInput
          aria-describedby={errors.newPassword ? 'newPassword-error' : undefined}
          aria-invalid={errors.newPassword ? true : undefined}
          autoComplete="new-password"
          id="newPassword"
          showStrength
          strengthInputs={passwordUserInputs(email)}
          {...register('newPassword')}
        />
        <FieldError id="newPassword-error">{errors.newPassword?.message}</FieldError>
      </div>
      <div>
        <Button disabled={isSubmitting} size="xl" type="submit">
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
