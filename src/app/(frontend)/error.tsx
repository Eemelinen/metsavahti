'use client'

import { type ErrorBoundaryProps, ErrorState } from '@/components/error-state'
import { SiteFrame } from '@/components/site-frame'

/** Root error boundary: replaces the route-group layouts, so it renders the frame itself. */
export default function FrontendError(props: ErrorBoundaryProps) {
  return (
    <SiteFrame>
      <ErrorState {...props} />
    </SiteFrame>
  )
}
