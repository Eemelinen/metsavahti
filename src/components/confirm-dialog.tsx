'use client'

import { AlertDialog } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * The App artboard's confirm dialog (`03-pages.md` `ConfirmDialog`): title, body, "Peruuta"
 * and a destructive confirm button. Escape, the overlay and "Peruuta" call `onCancel`, except
 * while `pending` (the confirmed action is running), when the dialog stays open and the
 * confirm button is disabled.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog.Root onOpenChange={(next) => !next && !pending && onCancel()} open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
          <AlertDialog.Content className="flex w-full max-w-110 flex-col gap-4 rounded-xl bg-paper-raised p-6 text-ink shadow-pop">
            <AlertDialog.Title className="text-xl font-bold text-forest-700">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-ink-muted">
              {description}
            </AlertDialog.Description>
            <div className="flex flex-wrap justify-end gap-2.5">
              <AlertDialog.Cancel className="min-h-11 cursor-pointer rounded-lg border border-line bg-paper-raised px-4.5 py-3 font-semibold text-forest-700 hover:bg-forest-50">
                {cancelLabel}
              </AlertDialog.Cancel>
              <button
                className="min-h-11 cursor-pointer rounded-lg bg-ember-700 px-4.5 py-3 font-semibold text-white hover:bg-ember-700/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={onConfirm}
                type="button"
              >
                {confirmLabel}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
