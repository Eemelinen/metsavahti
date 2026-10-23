'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fi } from '@/i18n/fi'
import { type ForgotPasswordValues, forgotPasswordSchema } from '@/lib/auth/password-reset-schema'

import { requestPasswordReset } from './actions'

const copy = fi.auth.forgotPassword

/**
 * "Unohtunut salasana" form (App artboard `unohtunut`): the address and "Lähetä ohjeet".
 * After the round trip the form gives way to the neutral confirmation, which reads the same
 * for a registered and an unknown address; only a rate limit or a server failure is an error.
 */
export function ForgotPasswordForm() {
  const hydrated = useHydrated()
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotPasswordValues) {
    setServerError(null)
    const result = await requestPasswordReset(values)
    if (result.ok) {
      setSent(true)
      return
    }
    setServerError(result.error.message)
  }

  if (sent) {
    return <FormSuccess className="leading-relaxed">{copy.sent}</FormSuccess>
  }

  return (
    <form
      className="flex flex-col gap-4.5"
      data-hydrated={hydrated ? '' : undefined}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <p className="leading-relaxed text-ink-muted">{copy.body}</p>
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
        {errors.email?.message ? (
          <p className="text-sm text-error" id="email-error" role="alert">
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <Button className="w-full" disabled={isSubmitting} size="xl" type="submit">
        {copy.submit}
      </Button>
    </form>
  )
}
