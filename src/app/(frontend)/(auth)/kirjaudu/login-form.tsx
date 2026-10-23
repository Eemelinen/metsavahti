'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { PasswordInput } from '@/components/forms/password-input'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'
import { type LoginField, type LoginFormValues, loginFormSchema } from '@/lib/auth/login-schema'

import { resendVerification } from '../vahvista-sahkoposti/actions'
import { type LoginDenied, login } from './actions'

const copy = fi.auth.login

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p className="text-sm text-error" id={id} role="alert">
      {children}
    </p>
  )
}

type Banner =
  { kind: 'denied'; denied: LoginDenied } | { kind: 'error'; message: string } | { kind: 'resent' }

function ResendLink({
  email,
  disabled,
  onResend,
}: {
  email: string
  disabled: boolean
  onResend: (email: string) => void
}) {
  return (
    <>
      {' '}
      <button
        className="font-semibold text-ember-700 underline disabled:opacity-50"
        disabled={disabled}
        onClick={() => onResend(email)}
        type="button"
      >
        {copy.resend}
      </button>
    </>
  )
}

function deniedMessage(denied: LoginDenied): string {
  switch (denied.status) {
    case 'locked':
      return copy.errors.locked
    case 'unverified':
      return copy.errors.unverified
    default:
      return copy.errors.invalid
  }
}

/**
 * Login form (App artboard `kirjaudu`): email, password with the show/hide toggle, "Muista
 * minut", the forgot-password link and one banner for whatever the `login` action refused.
 * The unverified banner carries the inline "Lähetä vahvistuslinkki uudelleen" button, which
 * calls the same `resendVerification` action as `/vahvista-sahkoposti`.
 */
export function LoginForm({ next }: { next: string }) {
  const hydrated = useHydrated()
  const [banner, setBanner] = useState<Banner | null>(null)
  const [resending, setResending] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '', remember: false, next },
  })

  async function onSubmit(values: LoginFormValues) {
    setBanner(null)
    // A successful call redirects (Next throws the navigation), so `result` is only a refusal.
    const result = await login(values)
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as LoginField, { type: 'server', message })
      }
      return
    }
    if (result.denied) {
      setBanner({ kind: 'denied', denied: result.denied })
      return
    }
    setBanner({ kind: 'error', message: result.error.message })
  }

  async function onResend(email: string) {
    setResending(true)
    try {
      const result = await resendVerification({ email })
      setBanner(result.ok ? { kind: 'resent' } : { kind: 'error', message: result.error.message })
    } finally {
      setResending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4.5"
      data-hydrated={hydrated ? '' : undefined}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <input type="hidden" {...register('next')} />
      {banner?.kind === 'resent' ? <FormSuccess>{copy.resent}</FormSuccess> : null}
      {banner?.kind === 'error' ? <FormError>{banner.message}</FormError> : null}
      {banner?.kind === 'denied' ? (
        <FormError>
          <span data-testid="login-denied" data-status={banner.denied.status}>
            {deniedMessage(banner.denied)}
          </span>
          {banner.denied.status === 'unverified' ? (
            <ResendLink disabled={resending} email={banner.denied.email} onResend={onResend} />
          ) : null}
        </FormError>
      ) : null}
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
          autoComplete="current-password"
          id="password"
          {...register('password')}
        />
        <FieldError id="password-error">{errors.password?.message}</FieldError>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2" htmlFor="remember">
          <input
            className="size-4.5 accent-forest-700"
            id="remember"
            type="checkbox"
            {...register('remember')}
          />
          {copy.remember}
        </label>
        <Link className="text-forest-600 hover:underline" href="/unohtunut-salasana">
          {copy.forgot}
        </Link>
      </div>
      <Button className="w-full" disabled={isSubmitting} size="xl" type="submit">
        {copy.submit}
      </Button>
    </form>
  )
}
