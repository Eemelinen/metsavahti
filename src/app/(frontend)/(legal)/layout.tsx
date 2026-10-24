import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site-frame'
import { env } from '@/lib/env'

/** `(legal)` layout (03-pages.md): the marketing header and footer around the legal pages. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <SiteFrame showPricing={env.SHOW_PRICING === '1'}>{children}</SiteFrame>
}
