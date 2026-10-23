'use client'

import '@/app/globals.css'
import { type ErrorBoundaryProps, ErrorState } from '@/components/error-state'
import { SiteFrame } from '@/components/site-frame'
import { figtree } from '@/lib/fonts'

/** Last resort when the root layout itself fails; must render its own `<html>` and `<body>`. */
export default function GlobalError(props: ErrorBoundaryProps) {
  return (
    <html className={figtree.variable} lang="fi">
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">
        <SiteFrame>
          <ErrorState {...props} />
        </SiteFrame>
      </body>
    </html>
  )
}
