'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

/** Returns to the previous page (browser history), e.g. to the form a redirect came from. */
export function GoBackButton({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <button className={className} type="button" onClick={() => router.back()}>
      {children}
    </button>
  )
}
