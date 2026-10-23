'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { FormError } from '@/components/forms/form-error'
import { FormSuccess } from '@/components/forms/form-success'
import { useHydrated } from '@/components/forms/use-hydrated'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { fi } from '@/i18n/fi'
import {
  LOCALES,
  type ProfileField,
  type ProfileFormValues,
  profileFormSchema,
} from '@/lib/account/account-schema'

import { updateProfile } from './actions'

const copy = fi.account.profile

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p className="text-sm text-error" id={id} role="alert">
      {children}
    </p>
  )
}

/**
 * The `/tili` profile card (App artboard `tili`): the address with "Vaihda" (the change flow
 * arrives with MV-052, until then the button is disabled), name, language and time zone, and
 * "Tallenna". A save refreshes the page so the header's initials follow the new name.
 */
export function ProfileForm({
  email,
  defaults,
  timezones,
}: {
  email: string
  defaults: ProfileFormValues
  timezones: string[]
}) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [status, setStatus] = useState<{ saved: true } | { error: string } | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: defaults,
  })

  async function onSubmit(values: ProfileFormValues) {
    setStatus(null)
    const result = await updateProfile(values)
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as ProfileField, { type: 'server', message })
      }
      return
    }
    if (result.error) {
      setStatus({ error: result.error.message })
      return
    }
    setStatus({ saved: true })
    router.refresh()
  }

  return (
    <form
      className="flex max-w-140 flex-col gap-4.5 rounded-xl border border-line bg-paper-raised p-5"
      data-hydrated={hydrated ? '' : undefined}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormSuccess>{status && 'saved' in status ? copy.saved : null}</FormSuccess>
      <FormError>{status && 'error' in status ? status.error : null}</FormError>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{copy.email}</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-describedby="email-hint"
            className="min-w-50 flex-1"
            id="email"
            readOnly
            type="email"
            value={email}
          />
          <Button
            aria-describedby="email-hint"
            className="h-12 px-3.5 font-semibold"
            disabled
            type="button"
            variant="outline"
          >
            {copy.changeEmail}
          </Button>
        </div>
        <p className="text-sm text-ink-muted" id="email-hint">
          {copy.emailHint} {copy.changeEmailSoon}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">
          {copy.name} <span className="font-normal text-ink-muted">{copy.optional}</span>
        </Label>
        <Input
          aria-describedby={errors.name ? 'name-error' : undefined}
          aria-invalid={errors.name ? true : undefined}
          autoComplete="name"
          id="name"
          type="text"
          {...register('name')}
        />
        <FieldError id="name-error">{errors.name?.message}</FieldError>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="locale">{copy.locale}</Label>
          <NativeSelect
            aria-describedby={errors.locale ? 'locale-error' : undefined}
            aria-invalid={errors.locale ? true : undefined}
            id="locale"
            {...register('locale')}
          >
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {copy.locales[locale]}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="locale-error">{errors.locale?.message}</FieldError>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">{copy.timezone}</Label>
          <NativeSelect
            aria-describedby={errors.timezone ? 'timezone-error' : undefined}
            aria-invalid={errors.timezone ? true : undefined}
            id="timezone"
            {...register('timezone')}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="timezone-error">{errors.timezone?.message}</FieldError>
        </div>
      </div>

      <div>
        <Button disabled={isSubmitting} size="xl" type="submit">
          {copy.submit}
        </Button>
      </div>
    </form>
  )
}
