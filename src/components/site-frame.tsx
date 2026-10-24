import type { ReactNode } from 'react'

import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/**
 * Header + content column + footer. The `(marketing)` layout renders it around every
 * page; the root error boundaries render it themselves because a boundary replaces the
 * layouts below it and the attribution must stay visible (AGENTS.md). `showPricing` is
 * `SHOW_PRICING` (`SiteHeader`).
 */
export function SiteFrame({
  children,
  showPricing,
}: {
  children: ReactNode
  showPricing?: boolean
}) {
  return (
    <>
      <SiteHeader showPricing={showPricing} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-8">{children}</main>
      <SiteFooter />
    </>
  )
}
