import type { Metadata } from 'next'
import Link from 'next/link'

import { fi } from '@/i18n/fi'

import { RegisterForm } from './register-form'

const copy = fi.auth.register

export const metadata: Metadata = { title: copy.title }

/** `/rekisteroidy` (App artboard `rekisteroidy`, E03 MV-042). Guest-only once MV-046 adds the middleware. */
export default function RegisterPage() {
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
