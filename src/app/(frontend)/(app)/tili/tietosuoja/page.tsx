import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import config from '@payload-config'
import { CookieSettingsButton } from '@/components/cookie-settings-button'
import { fi } from '@/i18n/fi'
import { dataExportState } from '@/lib/account/data-export'
import { formatSessionTime } from '@/lib/account/sessions'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { requireUser } from '@/lib/auth/guards'
import type { ConsentEvent } from '@/payload-types'

import { ExportSection } from './export-section'

const copy = fi.account.privacy

/** The Finnish data protection authority (`03b` §25: "link … to the supervisory authority"). */
const SUPERVISORY_AUTHORITY_URL = 'https://tietosuoja.fi'

export const metadata: Metadata = { title: fi.app.titles.privacy }

function consentLabel(event: Pick<ConsentEvent, 'kind' | 'granted'>): string {
  const labels = copy.consents.kinds[event.kind]
  return event.granted ? labels.granted : labels.denied
}

function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('fi-FI', {
    timeZone,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

/**
 * `/tili/tietosuoja` (App artboard `tietosuoja`, `03-pages.md`, E08 MV-093): "Lataa tietoni"
 * (the account export, one per day, link by email), the consent history from `consent-events`
 * (newest first), and links to the cookie settings, the privacy policy and the supervisory
 * authority.
 */
export default async function PrivacyPage() {
  const user = await requireUser({ next: '/tili/tietosuoja' })
  const payload = await getPayload({ config })
  const timeZone = user.timezone ?? DEFAULT_TIMEZONE
  const [exportState, { docs: consents }] = await Promise.all([
    dataExportState(payload, user),
    payload.find({
      collection: 'consent-events',
      where: { user: { equals: user.id } },
      sort: '-createdAt',
      depth: 0,
      limit: 100,
      overrideAccess: false,
      user,
    }),
  ])

  return (
    <div className="flex max-w-160 flex-col gap-4">
      <section
        aria-labelledby="export-title"
        className="flex flex-col gap-3 rounded-xl border border-line bg-paper-raised p-5"
      >
        <h2 className="text-lg font-semibold text-forest-700" id="export-title">
          {copy.export.title}
        </h2>
        <p className="text-sm text-ink-muted">{copy.export.body}</p>
        <ExportSection
          downloadUrl={exportState.downloadUrl}
          email={user.email}
          expiresAt={exportState.expiresAt && formatSessionTime(exportState.expiresAt, timeZone)}
          nextAllowedAt={
            exportState.nextAllowedAt && formatSessionTime(exportState.nextAllowedAt, timeZone)
          }
          status={exportState.status}
        />
      </section>

      <section
        aria-labelledby="consents-title"
        className="flex flex-col gap-2 rounded-xl border border-line bg-paper-raised p-5"
      >
        <h2 className="text-lg font-semibold text-forest-700" id="consents-title">
          {copy.consents.title}
        </h2>
        {consents.length === 0 ? (
          <p className="text-sm text-ink-muted">{copy.consents.empty}</p>
        ) : (
          <table
            aria-labelledby="consents-title"
            className="w-full text-sm"
            data-testid="consent-history"
          >
            <thead className="sr-only">
              <tr>
                <th scope="col">{copy.consents.choice}</th>
                <th scope="col">{copy.consents.date}</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((event) => (
                <tr
                  className="border-b border-paper-sunken last:border-b-0"
                  data-testid="consent-row"
                  key={event.id}
                >
                  <td className="py-2 pr-3">
                    {consentLabel(event)}
                    <span className="block text-xs text-ink-muted">
                      {copy.consents.version} {event.version}
                    </span>
                  </td>
                  <td className="py-2 text-right align-top whitespace-nowrap text-ink-muted">
                    {formatDate(event.createdAt, timeZone)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <nav aria-label={copy.links.label} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <CookieSettingsButton className="font-semibold text-forest-600 hover:underline">
          {copy.links.cookieSettings}
        </CookieSettingsButton>
        <Link className="font-semibold text-forest-600 hover:underline" href="/tietosuoja">
          {copy.links.policy}
        </Link>
        <a
          className="font-semibold text-forest-600 hover:underline"
          href={SUPERVISORY_AUTHORITY_URL}
          rel="noopener noreferrer"
        >
          {copy.links.authority}
        </a>
      </nav>
    </div>
  )
}
