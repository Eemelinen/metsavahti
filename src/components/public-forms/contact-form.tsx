'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

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
  type ContactField,
  type ContactFormValues,
  HONEYPOT_FIELD,
  type PublicFormActionResult,
  contactFormSchema,
} from '@/lib/public-forms/public-forms-schema'

const copy = fi.publicForms

export type SubmitContact = (
  input: ContactFormValues,
) => Promise<PublicFormActionResult<ContactField>>

/**
 * `/yhteystiedot` form (Yhteystiedot artboard, "Yhteydenotto"): name (optional), email,
 * message and consent. The schema runs in the browser and again in `submitContact`; a sent
 * form gives way to "Kiitos viestistäsi", whose "Lähetä toinen viesti" clears the message and
 * the consent but keeps the name and the address (artboard `reset`).
 */
export function ContactForm({ action }: { action: SubmitContact }) {
  const hydrated = useHydrated()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<ActionError | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: '', email: '', message: '', consent: false, [HONEYPOT_FIELD]: '' },
  })

  async function onSubmit(values: ContactFormValues) {
    setServerError(null)
    const result = await action(values)
    if (result.ok) {
      setSentTo(values.email)
      return
    }
    if (result.fieldErrors) {
      for (const [field, message] of Object.entries(result.fieldErrors)) {
        setError(field as ContactField, { type: 'server', message })
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
        title={copy.contact.sentTitle}
      >
        {copy.contact.sentBody(sentTo)}
      </SentState>
    )
  }

  return (
    <form
      aria-label={copy.contact.title}
      className="flex flex-col gap-4.5"
      data-hydrated={hydrated ? '' : undefined}
      noValidate
      onSubmit={handleSubmit(onSubmit)}
    >
      <FormError>{serverError?.message}</FormError>
      <div className="flex flex-col gap-1.5">
        <Label className="font-semibold" htmlFor="name">
          {copy.name}
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
        {copy.contact.submit}
      </Button>
    </form>
  )
}
