'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { FormError } from '@/components/forms/form-error'
import { PasswordInput } from '@/components/forms/password-input'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'
import {
  type ResetPasswordField,
  type ResetPasswordFormValues,
  resetPasswordFormSchema,
} from '@/lib/auth/password-reset-schema'
import { passwordUserInputs } from '@/lib/auth/registration-schema'

import { resetPassword } from './actions'
import { ResetLinkInvalid } from './reset-link-invalid'

const copy = fi.auth.resetPassword

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p className="text-sm text-error" id={id} role="alert">
      {children}
    </p>
  )
}

/**
 * "Aseta uusi salasana" form (App artboard `uusi_salasana`): the new password with the
 * strength meter, the confirmation and "Tallenna ja kirjaudu". The token travels as a
 * hidden field; the page already checked it, and if it stops being valid before the submit
 * (used from another tab, expired) the form turns into the same "expired or used" state.
 */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const hydrated = useHydrated()
  const [invalid, setInvalid] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { token, password: '', confirmPassword: '' },
  })

  async function onSubmit(values: ResetPasswordFormValues) {
    setServerError(null)
    // A successful call redirects (Next throws the navigation), so `result` is only a refusal.
    const result = await resetPassword(values)
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as ResetPasswordField, { type: 'server', message })
      }
      return
    }
    if (result.invalid) {
      setInvalid(true)
      return
    }
    setServerError(result.error.message)
  }

  if (invalid) return <ResetLinkInvalid />

  return (
    <form
      className="flex flex-col gap-4.5"
      data-hydrated={hydrated ? '' : undefined}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <input type="hidden" {...register('token')} />
      <FormError>{serverError}</FormError>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{copy.password}</Label>
        <PasswordInput
          aria-describedby={errors.password ? 'password-error' : undefined}
          aria-invalid={errors.password ? true : undefined}
          autoComplete="new-password"
          id="password"
          showStrength
          strengthInputs={passwordUserInputs(email)}
          {...register('password')}
        />
        <FieldError id="password-error">{errors.password?.message}</FieldError>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">{copy.confirmPassword}</Label>
        <Input
          aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
          aria-invalid={errors.confirmPassword ? true : undefined}
          autoComplete="new-password"
          id="confirmPassword"
          type="password"
          {...register('confirmPassword')}
        />
        <FieldError id="confirmPassword-error">{errors.confirmPassword?.message}</FieldError>
      </div>
      <Button className="w-full" disabled={isSubmitting} size="xl" type="submit">
        {copy.submit}
      </Button>
    </form>
  )
}
