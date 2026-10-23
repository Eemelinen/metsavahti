import type { ReactNode } from 'react'
import { cn } from 'cn'

type FormSuccessProps = {
  /** The message; `null`/`undefined` renders nothing so callers can pass state directly. */
  children?: ReactNode
  className?: string
  id?: string
}

/**
 * Form-level success / neutral-confirmation banner (App artboard, "Unohtunut salasana"
 * sent state): forest tint, `role="status"` (polite announcement).
 */
export function FormSuccess({ children, className, id }: FormSuccessProps) {
  if (children === null || children === undefined || children === false) return null
  return (
    <div
      className={cn('rounded-lg bg-forest-50 px-3.5 py-3.5 text-sm text-forest-700', className)}
      data-slot="form-success"
      id={id}
      role="status"
    >
      {children}
    </div>
  )
}
