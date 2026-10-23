import type { Metadata } from 'next'
import React from 'react'

import '@/app/globals.css'
import { figtree } from '@/lib/fonts'

export const metadata: Metadata = {
  title: { default: 'Metsävahti', template: '%s · Metsävahti' },
  description:
    'Metsävahti seuraa Metsäkeskuksen metsänkäyttöilmoituksia valitsemasi alueen ympärillä ja ilmoittaa uusista tai muuttuneista ilmoituksista.',
}

/** Root document for the frontend; the header and footer belong to the route-group layouts. */
export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={figtree.variable} lang="fi">
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">{children}</body>
    </html>
  )
}
