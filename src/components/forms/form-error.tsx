import type { ReactNode } from 'react'
import { cn } from 'cn'

type FormErrorProps = {
  /** The message; `null`/`undefined` renders nothing so callers can pass state directly. */
  children?: ReactNode
  className?: string
  id?: string
}

/**
 * Form-level error banner (App artboard, login route): ember tint, `role="alert"` so screen
 * readers announce it when it appears. Inline actions (e.g. "Lähetä vahvistuslinkki
 * uudelleen") go inside as children.
 */
export function FormError({ children, className, id }: FormErrorProps) {
  if (children === null || children === undefined || children === false) return null
  return (
    <div
      className={cn('rounded-lg bg-ember-100 px-3.5 py-3 text-sm text-ember-700', className)}
      data-slot="form-error"
      id={id}
      role="alert"
    >
      {children}
    </div>
  )
}
