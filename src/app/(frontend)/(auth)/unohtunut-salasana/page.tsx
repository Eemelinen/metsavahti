import type { Metadata } from 'next'
import Link from 'next/link'

import { fi } from '@/i18n/fi'

import { ForgotPasswordForm } from './forgot-form'

const copy = fi.auth.forgotPassword

export const metadata: Metadata = { title: copy.title, robots: { index: false } }

/**
 * `/unohtunut-salasana` inside the `(auth)` layout (App artboard `unohtunut`, E03 MV-045):
 * the address field, then the neutral "Jos osoite on rekisteröity …" confirmation. Guest-only
 * once MV-046 adds the route protection.
 */
export default function ForgotPasswordPage() {
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
