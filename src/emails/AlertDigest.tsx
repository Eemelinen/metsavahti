import { Column, Link, Row, Section } from '@react-email/components'

import {
  type AlertEmailItem,
  DigestItem,
  MAX_ALERT_ROWS,
  MAX_DIGEST_ROWS,
  MoreAlerts,
  formatAlertDate,
} from '@/emails/AlertParts'
import { EmailLayout, emailBodyCell } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'
import { colors } from '@/lib/design-tokens'

const copy = fi.emails.alertDigest

export type AlertDigestMode = 'daily' | 'weekly'

export type AlertDigestGroup = {
  watchAreaName: string
  /** This area's opt-out link (signed `unsub` token); the digest has one per area. */
  unsubscribeUrl: string
  /** At least one alert, newest first. */
  alerts: AlertEmailItem[]
}

export type AlertDigestProps = {
  /** `notificationPrefs.mode` of the account. */
  mode: AlertDigestMode
  /** The period the digest covers, for the badge ("Viikkokooste 31.8.–6.9."). */
  periodStart: Date
  periodEnd: Date
  groups: AlertDigestGroup[]
  baseUrl: string
  attribution: string
  timeZone?: string
}

/** The heading, also the subject line. */
export function alertDigestHeading({ groups }: Pick<AlertDigestProps, 'groups'>): string {
  const alerts = groups.flatMap((g) => g.alerts)
  return copy.heading(
    alerts.length,
    alerts.every((a) => a.changeType === 'new'),
  )
}

const groupHeader = {
  fontSize: 12,
  fontWeight: 700,
  color: colors.ink.faint,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '8px 0',
} as const

/**
 * Rows each group lists within `MAX_ALERT_ROWS` per area and `MAX_DIGEST_ROWS` in all, in group
 * order; a group past the budget still shows its header, count and unsubscribe link.
 */
function digestRowsPerGroup(groups: AlertDigestGroup[]): number[] {
  const rows: number[] = []
  let left = MAX_DIGEST_ROWS
  for (const group of groups) {
    const shown = Math.min(MAX_ALERT_ROWS, left, group.alerts.length)
    rows.push(shown)
    left -= shown
  }
  return rows
}

/**
 * The daily or weekly digest (Email artboard template 4, `01 §4.3`, MV-073): every pending
 * alert of the account grouped by watch area, each group with its count, its own unsubscribe
 * link and compact rows that open `/ilmoitukset/[id]` (at most `MAX_ALERT_ROWS` per area and
 * `MAX_DIGEST_ROWS` in all; the rest is a link to the alert list). The footer has the settings link and the
 * attribution; there is no single per-area link, since the digest covers several areas.
 */
export function AlertDigest(props: AlertDigestProps) {
  const { mode, periodStart, periodEnd, groups, baseUrl, attribution, timeZone } = props
  const heading = alertDigestHeading(props)
  const listUrl = `${baseUrl}/ilmoitukset`
  const rowsPerGroup = digestRowsPerGroup(groups)
  const badge =
    mode === 'daily'
      ? copy.badge.daily(formatAlertDate(periodEnd, timeZone, true))
      : copy.badge.weekly(
          formatAlertDate(periodStart, timeZone, true),
          formatAlertDate(periodEnd, timeZone, true),
        )
  return (
    <EmailLayout
      preview={`${heading}${copy.previewPeriod[mode]}`}
      badge={{ label: badge, tone: 'amber' }}
      heading={heading}
      lead={copy.lead[mode]}
      cta={{ label: fi.emails.alert.openAll, href: listUrl }}
      note={copy.note}
      footerWhy={copy.footerWhy[mode]}
      baseUrl={baseUrl}
      attribution={attribution}
    >
      {groups.map((group, index) => {
        const shown = group.alerts.slice(0, rowsPerGroup[index])
        return (
          <Section key={group.unsubscribeUrl} data-testid="digest-group">
            <Section style={{ ...emailBodyCell, paddingTop: 8 }}>
              <Row>
                <Column style={groupHeader}>
                  {`${group.watchAreaName} · ${copy.groupCount(group.alerts.length)}`}
                </Column>
                <Column style={{ textAlign: 'right', fontSize: 12, padding: '8px 0' }}>
                  <Link href={group.unsubscribeUrl} style={{ color: colors.ink.muted }}>
                    {copy.unsubscribeGroup}
                  </Link>
                </Column>
              </Row>
              {shown.map((item) => (
                <DigestItem key={item.declarationNumber} item={item} timeZone={timeZone} />
              ))}
            </Section>
            <MoreAlerts count={group.alerts.length - shown.length} href={listUrl} />
          </Section>
        )
      })}
    </EmailLayout>
  )
}

export function renderAlertDigest(props: AlertDigestProps): Promise<RenderedEmail> {
  return renderEmail(<AlertDigest {...props} />)
}
