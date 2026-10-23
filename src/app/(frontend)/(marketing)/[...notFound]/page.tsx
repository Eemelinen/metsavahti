import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Sivua ei löytynyt' }

/**
 * Catch-all for unmatched URLs. The frontend and the Payload admin are separate root
 * layouts, so Next's `/_not-found` route cannot be composed from a single root layout;
 * throwing `notFound()` here renders `../not-found.tsx` inside the marketing frame with a
 * real 404 status (docs/DECISIONS.md D-010).
 */
export default function CatchAllPage() {
  notFound()
}
