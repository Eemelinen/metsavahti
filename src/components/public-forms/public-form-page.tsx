import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from 'cn'

import { fi } from '@/i18n/fi'
import { publicFormInboxes } from '@/lib/public-forms/public-forms'

const copy = fi.publicForms

export const CONTACT_PATH = '/yhteystiedot'
export const DATA_REQUEST_PATH = '/tietopyynto'

const tabs = [
  { key: 'contact', href: CONTACT_PATH, label: copy.contactTab },
  { key: 'data-request', href: DATA_REQUEST_PATH, label: copy.dataRequestTab },
] as const

/**
 * Frame of `/yhteystiedot` and `/tietopyynto` (docs/design/Yhteystiedot.dc.html): title and
 * intro, the "Yhteydenotto | Tietopyyntö" switch, the service addresses and response times on
 * the left, the form card on the right (below on narrow screens). The artboard switches
 * forms in place; here the switch is two links, so each form keeps its own route (`03-pages.md`).
 */
export function PublicFormPage({
  active,
  title,
  intro,
  children,
}: {
  active: (typeof tabs)[number]['key']
  title: string
  intro: string
  children: ReactNode
}) {
  const inboxes = publicFormInboxes()
  const mail = (address: string) => (
    <a className="break-words text-forest-600 hover:underline" href={`mailto:${address}`}>
      {address}
    </a>
  )
  const details: Array<[string, ReactNode]> = [
    [copy.supportEmail, mail(inboxes.contact)],
    [copy.privacyEmail, mail(inboxes.dpo)],
    [copy.responseTime, copy.responseTimeValue],
  ]
  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-12 px-5 pt-16 pb-24 lg:grid-cols-3">
      <div className="flex flex-col gap-5">
        <h1 className="text-3xl font-bold text-forest-700 sm:text-4xl">{title}</h1>
        <p className="text-lg text-pretty text-ink-muted">{intro}</p>
        <nav aria-label={copy.tabsLabel}>
          <ul className="flex w-fit gap-1.5 rounded-xl bg-paper-sunken p-1">
            {tabs.map((tab) => {
              const current = tab.key === active
              return (
                <li key={tab.key}>
                  <Link
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold transition-colors',
                      current
                        ? 'bg-paper-raised text-forest-700 shadow-card'
                        : 'text-ink-muted hover:text-forest-700',
                    )}
                    href={tab.href}
                  >
                    {tab.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <dl
          aria-label={copy.contactDetails}
          className="flex flex-col gap-2.5 text-base leading-normal"
        >
          {details.map(([term, value]) => (
            <div className="flex gap-5" key={term}>
              <dt className="w-24 shrink-0 text-ink-muted">{term}</dt>
              <dd className="min-w-0">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex w-full max-w-150 min-w-0 flex-col gap-4.5 rounded-2xl border border-line bg-paper-raised px-6 py-7 shadow-card lg:col-span-2">
        {children}
      </div>
    </div>
  )
}
