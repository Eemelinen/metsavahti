'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { cn } from 'cn'

import { FormError } from '@/components/forms/form-error'
import { useHydrated } from '@/components/forms/use-hydrated'
import {
  ConsentCheckbox,
  FieldError,
  HoneypotField,
  RequiredMark,
  SentState,
} from '@/components/public-forms/form-fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fi } from '@/i18n/fi'
import type { ActionError } from '@/lib/errors'
import {
  DATA_REQUEST_TYPES,
  type DataRequestField,
  type DataRequestFormValues,
  HONEYPOT_FIELD,
  type PublicFormActionResult,
  dataRequestFormSchema,
} from '@/lib/public-forms/public-forms-schema'

const copy = fi.publicForms

export type SubmitDataRequest = (
  input: DataRequestFormValues,
) => Promise<PublicFormActionResult<DataRequestField>>

/** Where a signed-in person makes the request themselves (MV-093). */
const SELF_SERVICE_PATH = '/tili/tietosuoja'

/**
 * `/tietopyynto` form (Yhteystiedot artboard `#tietopyynto`): email, the request type as
 * radio cards (Tarkastus preselected, as on the artboard), the pointer to the account's own
 * privacy page, message and consent. On success the DPO has the request and the requester a
 * receipt; "Lähetä toinen viesti" clears the message and the consent.
 */
export function DataRequestForm({ action }: { action: SubmitDataRequest }) {
  const hydrated = useHydrated()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<ActionError | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<DataRequestFormValues>({
    resolver: zodResolver(dataRequestFormSchema),
    defaultValues: {
      email: '',
      type: 'access',
      message: '',
      consent: false,
      [HONEYPOT_FIELD]: '',
    },
  })

  async function onSubmit(values: DataRequestFormValues) {
    setServerError(null)
    const result = await action(values)
    if (result.ok) {
      setSentTo(values.email)
      return
    }
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as DataRequestField, { type: 'server', message })
      }
      return
    }
    setServerError(result.error)
  }

  if (sentTo) {
    return (
      <SentState
        onReset={() => {
          resetField('message')
          resetField('consent')
          setSentTo(null)
        }}
        title={copy.dataRequest.sentTitle}
      >
        {copy.dataRequest.sentBody(sentTo)}
      </SentState>
    )
  }

  return (
    <form
      aria-label={copy.dataRequest.title}
      className="flex flex-col gap-4.5"
      data-hydrated={hydrated ? '' : undefined}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormError>{serverError?.message}</FormError>
      <div className="flex flex-col gap-1.5">
        <Label className="font-semibold" htmlFor="email">
          {copy.email} <RequiredMark />
        </Label>
        <Input
          aria-describedby={errors.email ? 'email-error' : undefined}
          aria-invalid={errors.email ? true : undefined}
          aria-required="true"
          autoComplete="email"
          id="email"
          type="email"
          {...register('email')}
        />
        <FieldError id="email-error">{errors.email?.message}</FieldError>
      </div>
      <fieldset
        aria-describedby={errors.type ? 'type-error' : undefined}
        className="flex flex-col gap-2"
      >
        <legend className="mb-2 text-sm font-semibold">
          {copy.dataRequest.type} <RequiredMark />
        </legend>
        {DATA_REQUEST_TYPES.map((type) => {
          const option = copy.dataRequest.types[type]
          return (
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-paper-raised px-3.5 py-3 transition-colors',
                'has-checked:border-forest-700 has-checked:bg-forest-50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
              )}
              key={type}
            >
              <input
                className="mt-0.5 size-4.5 shrink-0 accent-forest-700"
                type="radio"
                value={type}
                {...register('type')}
              />
              <span className="leading-snug">
                <strong>{option.label}</strong>
                <br />
                <span className="text-sm text-ink-muted">{option.sub}</span>
              </span>
            </label>
          )
        })}
        <FieldError id="type-error">{errors.type?.message}</FieldError>
      </fieldset>
      <p className="rounded-md bg-paper px-3 py-2.5 text-sm leading-normal text-ink-muted">
        {copy.dataRequest.selfServicePrefix}{' '}
        <Link className="font-semibold text-forest-600 hover:underline" href={SELF_SERVICE_PATH}>
          {copy.dataRequest.selfServiceLink}
        </Link>
        {copy.dataRequest.selfServiceSuffix}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label className="font-semibold" htmlFor="message">
          {copy.message} <RequiredMark />
        </Label>
        <Textarea
          aria-describedby={errors.message ? 'message-error' : undefined}
          aria-invalid={errors.message ? true : undefined}
          aria-required="true"
          id="message"
          rows={5}
          {...register('message')}
        />
        <FieldError id="message-error">{errors.message?.message}</FieldError>
      </div>
      <HoneypotField {...register(HONEYPOT_FIELD)} />
      <ConsentCheckbox error={errors.consent?.message} {...register('consent')} />
      <Button className="w-full" disabled={isSubmitting} size="xl" type="submit">
        {copy.dataRequest.submit}
      </Button>
    </form>
  )
}
