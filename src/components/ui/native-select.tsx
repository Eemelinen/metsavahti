import * as React from 'react'
import { cn } from 'cn'

/**
 * A native `<select>` styled like `Input` (App artboard `tili`: Kieli, Aikavyöhyke). Native on
 * purpose: the option lists are short and the platform picker is the accessible one on mobile.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'h-12 w-full min-w-0 rounded-lg border border-input bg-paper-raised px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { NativeSelect }
