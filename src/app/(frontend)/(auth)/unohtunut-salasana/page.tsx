import type { Metadata } from 'next'
import Link from 'next/link'

import { fi } from '@/i18n/fi'
import { redirectSignedInUser } from '@/lib/auth/guards'

import { ForgotPasswordForm } from './forgot-form'

const copy = fi.auth.forgotPassword

export const metadata: Metadata = { title: copy.title, robots: { index: false } }

/**
 * `/unohtunut-salasana` inside the `(auth)` layout (App artboard `unohtunut`, E03 MV-045):
 * the address field, then the neutral "Jos osoite on rekisteröity …" confirmation. Guest-only: a
 * signed-in user goes to the app (MV-046).
 */
export default async function ForgotPasswordPage() {
  await redirectSignedInUser()
  return (
    <>
      <h1 className="text-2xl font-bold text-forest-700">{copy.title}</h1>
      <ForgotPasswordForm />
      <p className="text-center text-sm">
        <Link className="font-semibold text-forest-600 hover:underline" href="/kirjaudu">
          {copy.backToLogin}
        </Link>
      </p>
    </>
  )
}
