import Link from 'next/link'
import { cn } from 'cn'

import { fi } from '@/i18n/fi'

/**
 * Logo link (forest square with an amber dot + wordmark) from the artboards' header and auth
 * layout (docs/design/Landing.dc.html#header-footer, App.dc.html auth layout).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      className={cn(
        'flex items-center gap-2.5 text-xl font-bold tracking-tight text-forest-700',
        className,
      )}
      href="/"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-7 items-center justify-center rounded-md bg-forest-700"
      >
        <span className="block size-2.5 rounded-full bg-amber-300" />
      </span>
      {fi.brand.name}
    </Link>
  )
}
