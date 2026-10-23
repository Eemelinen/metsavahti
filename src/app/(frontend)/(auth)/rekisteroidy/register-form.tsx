'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { type ReactNode, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { FormError } from '@/components/forms/form-error'
import { PasswordInput } from '@/components/forms/password-input'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'
import {
  type RegistrationField,
  type RegistrationFormValues,
  passwordUserInputs,
  registrationFormSchema,
} from '@/lib/auth/registration-schema'

import { register as registerAction } from './actions'

const copy = fi.auth.register

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p className="text-sm text-error" id={id} role="alert">
      {children}
    </p>
  )
}

function CheckboxRow({
  id,
  error,
  children,
  ...props
}: React.ComponentProps<'input'> & { id: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug" htmlFor={id}>
        <input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-4.5 shrink-0 accent-forest-700"
          id={id}
          type="checkbox"
          {...props}
        />
        <span>{children}</span>
      </label>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}

/**
 * Registration form (App artboard `rekisteroidy`). The schema runs in the browser for
 * inline errors and again in the `register` action, which adds the zxcvbn requirement,
 * the rate limit and the duplicate check, then redirects to `/vahvista-sahkoposti`.
 */
export function RegisterForm() {
  const hydrated = useHydrated()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
      marketing: false,
    },
  })
  const email = useWatch({ control, name: 'email' })

  async function onSubmit(values: RegistrationFormValues) {
    setServerError(null)
    // A successful call redirects (Next throws the navigation), so `result` is only an error.
    const result = await registerAction(values)
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as RegistrationField, { type: 'server', message })
      }
      return
    }
    setServerError(result.error.message)
  }

  return (
    <form
      className="flex flex-col gap-4.5"
      data-hydrated={hydrated ? '' : undefined}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormError>{serverError}</FormError>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{copy.email}</Label>
        <Input
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={errors.email ? true : undefined}
          autoComplete="email"
          id="email"
          type="email"
          {...register('email')}
        />
        <FieldError id="email-error">{errors.email?.message}</FieldError>
      </div>
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
      <CheckboxRow
        error={errors.acceptTerms?.message}
        id="acceptTerms"
        {...register('acceptTerms')}
      >
        {copy.termsPrefix}{' '}
        <Link className="font-semibold text-forest-600 hover:underline" href="/tietosuoja">
          {copy.privacyLink}
        </Link>{' '}
        {copy.termsMiddle}{' '}
        <Link className="font-semibold text-forest-600 hover:underline" href="/kayttoehdot">
          {copy.termsLink}
        </Link>
        . <span className="text-error">*</span>
      </CheckboxRow>
      <CheckboxRow id="marketing" {...register('marketing')}>
        {copy.marketing}
      </CheckboxRow>
      <Button className="w-full" disabled={isSubmitting} size="xl" type="submit">
        {copy.submit}
      </Button>
    </form>
  )
}
