import type { Metadata } from 'next'
import Link from 'next/link'

import { systemAction } from '@/components/system-page'
import { fi } from '@/i18n/fi'

const copy = fi.account.deleteAccount.done

export const metadata: Metadata = { title: copy.title, robots: { index: false } }

/**
 * `/tili-poistettu` (App artboard `poista`, deleted state; `03-pages.md`, E08 MV-094): where
 * `/tili/poista` lands once the account is gone. Static and public, like `/kirjauduttu-ulos`.
 */
export default function AccountDeletedPage() {
  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <h1 className="text-2xl font-bold text-balance text-forest-700">{copy.title}</h1>
      <p className="leading-relaxed text-pretty text-ink-muted">{copy.body}</p>
      <Link className={`${systemAction.primary} w-full`} href="/">
        {copy.home}
      </Link>
    </div>
  )
}
