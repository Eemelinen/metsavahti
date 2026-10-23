import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import { fi } from '@/i18n/fi'
import {
  type SessionListItem,
  currentSessionId,
  formatSessionTime,
  listUserSessions,
} from '@/lib/account/sessions'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { requireUser } from '@/lib/auth/guards'

import { ChangePasswordForm } from './change-password-form'
import { LogOutOthersButton } from './log-out-others-button'

const copy = fi.account.sessions

export const metadata: Metadata = { title: fi.app.titles.security }

function SessionRow({ session, timeZone }: { session: SessionListItem; timeZone: string }) {
  const lastSeen = session.activeNow
    ? copy.now
    : session.lastSeenAt
      ? formatSessionTime(session.lastSeenAt, timeZone)
      : null
  return (
    <li
      className="flex justify-between gap-3 border-b border-paper-sunken py-2.5 text-sm last:border-b-0"
      data-current={session.current ? '' : undefined}
      data-testid="session-row"
    >
      <div>
        {session.current ? (
          <>
            <strong>{copy.thisDevice}</strong> · {session.device}
          </>
        ) : (
          <strong>{session.device}</strong>
        )}
        <br />
        <span className="text-ink-muted">
          {session.createdAt ? copy.signedIn(formatSessionTime(session.createdAt, timeZone)) : null}
          {session.createdAt && lastSeen ? ' · ' : null}
          {lastSeen ? copy.lastSeen(lastSeen) : null}
        </span>
      </div>
      {session.current ? (
        <span className="font-semibold text-forest-600">{copy.active}</span>
      ) : null}
    </li>
  )
}

/**
 * `/tili/turvallisuus` (App artboard `turvallisuus`, `03-pages.md`, E04 MV-051): change the
 * password (current one required; other sessions end), the account's live sessions with this
 * device first, "Kirjaa ulos muista laitteista", and the two-factor placeholder.
 */
export default async function SecurityPage() {
  const user = await requireUser({ next: '/tili/turvallisuus' })
  const payload = await getPayload({ config })
  const sid = currentSessionId(payload, await headers(), user)
  const sessions = await listUserSessions(payload, user, sid)
  const timeZone = user.timezone ?? DEFAULT_TIMEZONE
  const others = sessions.some((session) => !session.current)

  return (
    <div className="flex max-w-140 flex-col gap-4">
      <ChangePasswordForm email={user.email} />

      <section
        aria-labelledby="sessions-title"
        className="flex flex-col gap-3 rounded-xl border border-line bg-paper-raised p-5"
      >
        <h2 className="text-lg font-semibold text-forest-700" id="sessions-title">
          {copy.title}
        </h2>
        <ul data-testid="session-list">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} timeZone={timeZone} />
          ))}
        </ul>
        {others ? null : <p className="text-sm text-ink-muted">{copy.noOthers}</p>}
        <LogOutOthersButton />
      </section>

      <p className="rounded-xl border border-dashed border-line-strong px-5 py-4 text-sm text-ink-muted">
        {fi.account.twoFactor}
      </p>
    </div>
  )
}
