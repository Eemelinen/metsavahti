import type { Metadata } from 'next'
import { connection } from 'next/server'
import React from 'react'

import '@/app/globals.css'
import { figtree } from '@/lib/fonts'

export const metadata: Metadata = {
  title: { default: 'Metsävahti', template: '%s · Metsävahti' },
  description:
    'Metsävahti seuraa Metsäkeskuksen metsänkäyttöilmoituksia valitsemasi alueen ympärillä ja ilmoittaa uusista tai muuttuneista ilmoituksista.',
}

/**
 * Root document for the frontend; the header and footer belong to the route-group layouts.
 *
 * `connection()` renders every frontend page per request: `src/proxy.ts` sends a fresh CSP
 * nonce with each one and Next.js can only stamp it on its scripts while rendering, so a
 * prerendered page would have its scripts blocked (MV-046, D-020).
 */
export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return (
    <html className={figtree.variable} lang="fi">
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">{children}</body>
    </html>
  )
}
