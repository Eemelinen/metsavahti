'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { DropdownMenu } from 'radix-ui'
import { cn } from 'cn'

import { fi } from '@/i18n/fi'

const itemClass = 'flex cursor-pointer rounded-md px-3 py-2.5 text-base outline-none select-none'

/**
 * Account menu in the app header (docs/design/App.dc.html, 03b "Header (logged in)"): the
 * initials button opens the address, Tili, Asetukset and Kirjaudu ulos. Logging out submits a
 * plain POST form to `/kirjaudu-ulos` (MV-044); the form sits outside the menu because the
 * menu unmounts its items as soon as one is selected.
 */
export function AccountMenu({ email, initials }: { email: string; initials: string }) {
  const logoutForm = useRef<HTMLFormElement>(null)

  return (
    <>
      <form ref={logoutForm} action="/kirjaudu-ulos" hidden method="post" />
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          aria-label={`${fi.app.accountMenu.trigger}: ${email}`}
          className="inline-flex size-10 items-center justify-center rounded-full bg-forest-50 text-sm font-bold text-forest-700 transition-colors outline-none hover:bg-forest-100 focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid="account-menu-trigger"
        >
          <span aria-hidden="true">{initials}</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            className="z-30 flex min-w-50 flex-col rounded-xl border border-line bg-paper-raised p-1.5 shadow-pop"
            sideOffset={8}
          >
            <DropdownMenu.Label className="mb-1 border-b border-line px-3 py-2.5 text-sm break-all text-ink-muted">
              {email}
            </DropdownMenu.Label>
            <DropdownMenu.Item
              asChild
              className={cn(itemClass, 'text-ink data-highlighted:bg-paper-sunken')}
            >
              <Link href="/tili">{fi.app.accountMenu.account}</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              asChild
              className={cn(itemClass, 'text-ink data-highlighted:bg-paper-sunken')}
            >
              <Link href="/tili/ilmoitukset">{fi.app.accountMenu.settings}</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={cn(itemClass, 'text-ember-700 data-highlighted:bg-ember-100')}
              onSelect={() => logoutForm.current?.requestSubmit()}
            >
              {fi.app.accountMenu.logout}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  )
}
