import type { Metadata } from 'next'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fi } from '@/i18n/fi'
import { DEFAULT_TIMEZONE, timezoneOptions } from '@/lib/account/timezone'
import { requireUser } from '@/lib/auth/guards'
import { loadReacceptance } from '@/lib/legal/reacceptance'

import { ReacceptanceBanner } from '../reacceptance-banner'
import { ProfileForm } from './profile-form'

export const metadata: Metadata = { title: fi.app.nav.account }

/**
 * `/tili` (App artboard `tili`, `03-pages.md`, E04 MV-051): the signed-in user's profile —
 * address (with "Vaihda", MV-052's change flow), name, language, time zone. Above it
 * `ReacceptanceBanner` while the current terms / privacy versions are not accepted (MV-086).
 */
export default async function TiliPage() {
  const user = await requireUser({ next: '/tili' })
  const reacceptance = await loadReacceptance(await getPayload({ config }), user)
  return (
    <>
      {reacceptance && <ReacceptanceBanner reacceptance={reacceptance} />}
      <ProfileForm
        defaults={{
          name: user.name ?? '',
          locale: user.locale ?? 'fi',
          timezone: user.timezone ?? DEFAULT_TIMEZONE,
        }}
        email={user.email}
        pendingEmail={user.pendingEmail ?? null}
        timezones={timezoneOptions(user.timezone)}
      />
    </>
  )
}
