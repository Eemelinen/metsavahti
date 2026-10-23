'use client'

import * as React from 'react'
import { cn } from 'cn'
import { Switch as SwitchPrimitive } from 'radix-ui'

/**
 * On/off switch (App artboard `ilmoitusasetukset`): forest-600 track when on, sage-300 when
 * off, white knob. `md` is the 48 × 28 px global switch, `sm` the 44 × 26 px row switch. Radix
 * renders a `button` with `role="switch"` and `aria-checked`, which the styles key on.
 */
function Switch({
  className,
  size = 'md',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { size?: 'md' | 'sm' }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'group relative inline-flex flex-none cursor-pointer items-center rounded-full bg-sage-300 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-forest-600',
        size === 'md' ? 'h-7 w-12' : 'h-6.5 w-11',
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block translate-x-0.75 rounded-full bg-white shadow-card transition-transform',
          size === 'md'
            ? 'size-5.5 group-aria-checked:translate-x-5.75'
            : 'size-5 group-aria-checked:translate-x-5.25',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
