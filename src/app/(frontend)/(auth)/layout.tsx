import type { ReactNode } from 'react'

import { Attribution } from '@/components/attribution'
import { BrandMark } from '@/components/brand-mark'

/**
 * `(auth)` layout (03-pages.md `AuthLayout`, App artboard auth routes): the brand mark above
 * a centred card on the paper background. No site header or footer; the Metsäkeskus
 * attribution stays visible below the card (AGENTS.md licence rule).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-8">
      <BrandMark />
      <main className="flex w-full max-w-md flex-col gap-4.5 rounded-xl border border-line bg-paper-raised px-6 py-7 shadow-card">
        {children}
      </main>
      <footer className="w-full max-w-md text-center">
        <Attribution />
      </footer>
    </div>
  )
}
