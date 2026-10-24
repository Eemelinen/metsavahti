import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site-frame'
import { env } from '@/lib/env'

/** `(marketing)` layout (03-pages.md): SiteHeader, content column, SiteFooter. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <SiteFrame showPricing={env.SHOW_PRICING === '1'}>{children}</SiteFrame>
}
