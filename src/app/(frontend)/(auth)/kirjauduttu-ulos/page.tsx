import type { Metadata } from 'next'
import Link from 'next/link'

import { systemAction } from '@/components/system-page'
import { fi } from '@/i18n/fi'
import { LOGIN_PATH } from '@/lib/auth/login-schema'

const copy = fi.auth.logout

export const metadata: Metadata = { title: copy.title, robots: { index: false } }

/**
 * `/kirjauduttu-ulos` (App artboard `kirjauduttu_ulos`, E03 MV-044): where the logout POST
 * lands. Static and public; it only says that the watch areas keep running and offers the
 * way back in.
 */
export default function LoggedOutPage() {
  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <h1 className="text-2xl font-bold text-balance text-forest-700">{copy.title}</h1>
      <p className="leading-relaxed text-pretty text-ink-muted">{copy.body}</p>
      <Link className={`${systemAction.primary} w-full`} href={LOGIN_PATH}>
        {copy.back}
      </Link>
      <Link className="text-sm font-semibold text-forest-600 hover:underline" href="/">
        {copy.home}
      </Link>
    </div>
  )
}
