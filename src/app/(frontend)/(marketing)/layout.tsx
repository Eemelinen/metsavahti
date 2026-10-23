import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site-frame'

/** `(marketing)` layout (03-pages.md): SiteHeader, content column, SiteFooter. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>
}
