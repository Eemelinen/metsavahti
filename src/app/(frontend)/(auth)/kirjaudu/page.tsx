import type { Metadata } from 'next'
import Link from 'next/link'

import { FormSuccess } from '@/components/forms/form-success'
import { fi } from '@/i18n/fi'
import { safeNextPath } from '@/lib/auth/login-schema'

import { LoginForm } from './login-form'

const copy = fi.auth.login

export const metadata: Metadata = { title: copy.title }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * `/kirjaudu` inside the `(auth)` layout (App artboard `kirjaudu`, E03 MV-044). `?next=` is
 * the page to return to after the login (same-origin paths only, `safeNextPath()`); the
 * `login` action checks it again. `?reset=1` is where `/uusi-salasana` lands (MV-045) and
 * adds the "Salasana vaihdettu" banner. Guest-only once MV-046 adds the route protection.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { next: raw, reset } = await searchParams
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw)
  const afterReset = (Array.isArray(reset) ? reset[0] : reset) === '1'
  return (
    <>
      <h1 className="text-2xl font-bold text-forest-700">{copy.title}</h1>
      {afterReset ? (
        <FormSuccess className="-mb-1" id="password-reset">
          {copy.passwordReset}
        </FormSuccess>
      ) : null}
      <LoginForm next={next} />
      <p className="text-center text-sm text-ink-muted">
        {copy.noAccount}{' '}
        <Link className="font-semibold text-forest-600 hover:underline" href="/rekisteroidy">
          {copy.register}
        </Link>
      </p>
    </>
  )
}
