import type { ReactNode } from 'react'

import { AccountTabs } from '@/components/account/account-tabs'
import { fi } from '@/i18n/fi'

/**
 * Frame of the account pages (App artboard `tili`): "Tili ja asetukset" and the tab row. No
 * session check here; each page calls `requireUser({ next })` (see the `(app)` layout).
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-205 flex-col gap-5">
      <h1 className="text-2xl font-bold text-forest-700">{fi.account.title}</h1>
      <AccountTabs />
      {children}
    </div>
  )
}
