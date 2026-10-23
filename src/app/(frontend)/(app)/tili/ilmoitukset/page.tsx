import type { Metadata } from 'next'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fi } from '@/i18n/fi'
import {
  listWatchAreaNotifications,
  notificationSettingsOf,
} from '@/lib/account/notification-settings'
import { requireUser } from '@/lib/auth/guards'

import { NotificationSettingsForm } from './notification-settings-form'

export const metadata: Metadata = { title: fi.app.titles.notificationSettings }

/**
 * `/tili/ilmoitukset` (App artboard `ilmoitusasetukset`, `03-pages.md`, E04 MV-054): the global
 * email switch, the delivery mode, each watch area's own switch, the marketing consent and
 * "Lähetä testisähköposti". Every control saves on its own.
 */
export default async function NotificationSettingsPage() {
  const user = await requireUser({ next: '/tili/ilmoitukset' })
  const areas = await listWatchAreaNotifications(await getPayload({ config }), user)
  return (
    <NotificationSettingsForm
      areas={areas}
      email={user.email}
      settings={notificationSettingsOf(user)}
    />
  )
}
