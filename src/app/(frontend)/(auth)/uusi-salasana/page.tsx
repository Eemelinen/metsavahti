import type { Metadata } from 'next'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fi } from '@/i18n/fi'
import { findPasswordResetUser } from '@/lib/auth/password-reset'

import { ResetPasswordForm } from './reset-form'
import { ResetLinkInvalid } from './reset-link-invalid'

const copy = fi.auth.resetPassword

export const metadata: Metadata = { title: copy.title, robots: { index: false } }
// The token's validity is checked on every request; the page must never be cached.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ token?: string | string[] }> }

/**
 * `/uusi-salasana?token=` (App artboard `uusi_salasana`, E03 MV-045): the link from
 * `ResetPassword`. A valid, unexpired token shows the form (the account's address feeds
 * the strength meter, as at registration); anything else shows the "expired or used" state
 * with a link back to `/unohtunut-salasana`. Success goes to `/kirjaudu?reset=1`.
 */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token: raw } = await searchParams
  const token = Array.isArray(raw) ? raw[0] : raw
  const payload = await getPayload({ config })
  const user = await findPasswordResetUser(payload, token)
  if (!user || !token) return <ResetLinkInvalid />
  return (
    <div data-state="form" data-testid="reset-outcome">
      <h1 className="mb-4.5 text-2xl font-bold text-forest-700">{copy.title}</h1>
      <ResetPasswordForm email={user.email} token={token} />
    </div>
  )
}
