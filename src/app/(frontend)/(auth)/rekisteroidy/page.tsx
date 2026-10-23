import type { Metadata } from 'next'
import Link from 'next/link'

import { fi } from '@/i18n/fi'
import { redirectSignedInUser } from '@/lib/auth/guards'

import { RegisterForm } from './register-form'

const copy = fi.auth.register

export const metadata: Metadata = { title: copy.title }

/** `/rekisteroidy` (App artboard `rekisteroidy`, E03 MV-042). Guest-only: a signed-in user goes to the app (MV-046). */
export default async function RegisterPage() {
  await redirectSignedInUser()
  return (
    <>
      <h1 className="text-2xl font-bold text-forest-700">{copy.title}</h1>
      <RegisterForm />
      <p className="text-center text-sm text-ink-muted">
        {copy.hasAccount}{' '}
        <Link className="font-semibold text-forest-600 hover:underline" href="/kirjaudu">
          {copy.login}
        </Link>
      </p>
    </>
  )
}
