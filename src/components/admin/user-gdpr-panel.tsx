import type { UIFieldServerProps } from 'payload'

import { fi } from '@/i18n/fi'
import { adminGdprOverview } from '@/lib/account/admin-gdpr'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { isAdminUser } from '@/payload/access'

import { UserGdprActions } from './user-gdpr-actions'

const t = fi.admin.gdpr
const consentKinds = fi.account.privacy.consents.kinds

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('fi-FI', {
    timeZone: DEFAULT_TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

/**
 * The "Tietosuoja" section of a user's detail view in the Payload admin (MV-098), a `ui` field
 * on `users`: the consent history (every `consent-events` row, newest first), the latest export
 * request and the support-request actions (`UserGdprActions`). Nothing on the create view.
 * Styled by Payload's admin classes; only admins reach the admin panel.
 */
export async function UserGdprPanel({ id, data, payload, user }: UIFieldServerProps) {
  if (id === undefined || !isAdminUser(user)) return null
  const { consents, exportState } = await adminGdprOverview(payload, Number(id))
  const exportLine =
    exportState.status === 'none'
      ? t.exportState.none
      : [
          t.exportState[exportState.status],
          exportState.expiresAt
            ? `${t.exportState.validUntil} ${formatTime(exportState.expiresAt)}`
            : null,
        ]
          .filter(Boolean)
          .join(', ')

  return (
    <section aria-label={t.title} data-testid="user-gdpr-panel">
      <h3>{t.title}</h3>

      <h4 id="user-gdpr-consents">{t.consents.title}</h4>
      {consents.length === 0 ? (
        <p>{t.consents.empty}</p>
      ) : (
        <div className="table">
          <table aria-labelledby="user-gdpr-consents">
            <thead>
              <tr>
                <th scope="col">{t.consents.choice}</th>
                <th scope="col">{t.consents.version}</th>
                <th scope="col">{t.consents.date}</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((event) => (
                <tr key={event.id}>
                  <td>
                    {event.granted
                      ? consentKinds[event.kind].granted
                      : consentKinds[event.kind].denied}
                  </td>
                  <td>{event.version}</td>
                  <td>{formatTime(event.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4>{t.exportState.title}</h4>
      <p>{exportLine}</p>
      {exportState.nextAllowedAt ? (
        <p>
          {t.exportState.nextAllowedAt} {formatTime(exportState.nextAllowedAt)}
        </p>
      ) : null}

      <h4>{t.actions.title}</h4>
      <p>{t.actions.intro}</p>
      <UserGdprActions
        userId={Number(id)}
        isAdminAccount={data?.role === 'admin'}
        beingDeleted={Boolean(data?.deletedAt)}
      />
    </section>
  )
}
