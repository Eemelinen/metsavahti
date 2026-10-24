'use client'

import { Dialog } from 'radix-ui'
import { useId } from 'react'

import { FormError } from '@/components/forms/form-error'
import { Switch } from '@/components/ui/switch'
import { fi } from '@/i18n/fi'

const copy = fi.consent.modal

function CategoryRow({
  title,
  body,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string
  body: string
  checked: boolean
  disabled?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line p-3.5">
      <div>
        <div className="font-semibold" id={`${id}-title`}>
          {title}
        </div>
        <div className="text-sm text-ink-muted" id={`${id}-body`}>
          {body}
        </div>
      </div>
      <Switch
        aria-describedby={`${id}-body`}
        aria-labelledby={`${id}-title`}
        checked={checked}
        disabled={disabled}
        size="sm"
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

/**
 * "Evästeasetukset" (Landing artboard `#consent`, Legal artboard `#evasteet`): the necessary
 * category is shown on and locked, analytics is a switch. Nothing is stored until "Tallenna
 * valinnat"; "Sulje", Escape and a click on the backdrop leave the saved choice as it was.
 * Radix traps focus while it is open and returns it to the opener afterwards.
 */
export function ConsentModal({
  open,
  analytics,
  pending,
  error,
  onAnalyticsChange,
  onSave,
  onOpenChange,
}: {
  open: boolean
  analytics: boolean
  pending: boolean
  error: string | null
  onAnalyticsChange: (analytics: boolean) => void
  onSave: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
          <Dialog.Content
            aria-describedby={undefined}
            className="flex w-full max-w-130 flex-col gap-4.5 rounded-xl bg-paper-raised p-6 text-ink shadow-pop"
            data-testid="consent-modal"
          >
            <Dialog.Title className="text-xl font-bold text-forest-700">{copy.title}</Dialog.Title>
            <CategoryRow body={copy.necessaryBody} checked disabled title={copy.necessary} />
            <CategoryRow
              body={copy.analyticsBody}
              checked={analytics}
              title={copy.analytics}
              onCheckedChange={onAnalyticsChange}
            />
            <FormError>{error}</FormError>
            <div className="flex flex-wrap gap-2.5">
              <button
                className="min-h-11 flex-1 cursor-pointer rounded-lg bg-forest-700 px-4.5 py-3 font-semibold text-white hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                type="button"
                onClick={onSave}
              >
                {copy.save}
              </button>
              <Dialog.Close className="min-h-11 cursor-pointer rounded-lg border border-line bg-paper-raised px-4.5 py-3 font-semibold text-forest-700 hover:bg-forest-50">
                {copy.close}
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
