import {
  type AlertEmailItem,
  AlertDetails,
  MAX_ALERT_ROWS,
  MoreAlerts,
  alertDistanceText,
  formatAlertArea,
} from '@/emails/AlertParts'
import { type EmailBadgeTone, EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'
import { cuttingTypeLabel } from '@/lib/wfs/codes'
import type { AlertChangeType } from '@/payload/collections/Alerts'

const copy = fi.emails.alertImmediate

const BADGE_TONE: Record<AlertChangeType, EmailBadgeTone> = {
  new: 'ember',
  geometry_changed: 'amber',
  attributes_changed: 'amber',
  removed: 'neutral',
}

export type AlertImmediateProps = {
  watchAreaName: string
  /** The area's un-notified alerts of this run, at least one, newest first. */
  alerts: AlertEmailItem[]
  /** Per-area opt-out link (signed `unsub` token, `src/lib/notifications/unsubscribe.ts`). */
  unsubscribeUrl: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the alert list and the footer links derive from it. */
  baseUrl: string
  attribution: string
  /** The account's time zone for the received dates. */
  timeZone?: string
}

/** The heading, also the subject line: one alert names its change, several are counted. */
export function alertImmediateHeading({ watchAreaName, alerts }: AlertImmediateProps): string {
  const [first] = alerts
  if (alerts.length === 1 && first) return copy.heading[first.changeType](watchAreaName)
  const allNew = alerts.every((a) => a.changeType === 'new')
  return copy.headingMany(alerts.length, watchAreaName, allNew)
}

/**
 * "Uusi metsänkäyttöilmoitus vahtialueellasi …" (Email artboard template 3, `01 §4.3`, MV-073):
 * one watch area, one or more alerts. Each alert shows the optional map image, the cutting type
 * with its explanation, area, "noin 350 m tontistasi" and the received date. One alert: the CTA
 * opens `/ilmoitukset/[id]`; several: each has its own link and the CTA opens the alert list.
 * The footer carries the area's unsubscribe link, the settings link and the attribution.
 */
export function AlertImmediate(props: AlertImmediateProps) {
  const { watchAreaName, alerts, unsubscribeUrl, baseUrl, attribution, timeZone } = props
  const [first] = alerts
  const single = alerts.length === 1 && first
  const listUrl = `${baseUrl}/ilmoitukset`
  const shown = alerts.slice(0, MAX_ALERT_ROWS)
  const summary = first
    ? `${cuttingTypeLabel(first.cuttingTypeCode)}, ${formatAlertArea(first.areaHa)}, ${alertDistanceText(first.distanceM)}`
    : ''
  return (
    <EmailLayout
      preview={single ? summary : `${summary}${copy.previewMore(alerts.length - 1)}`}
      badge={
        single
          ? { label: copy.badge[first.changeType], tone: BADGE_TONE[first.changeType] }
          : { label: copy.badge.many, tone: 'ember' }
      }
      heading={alertImmediateHeading(props)}
      lead={
        single
          ? copy.lead[first.changeType](alertDistanceText(first.distanceM))
          : copy.leadMany(alerts.length)
      }
      cta={
        single
          ? { label: fi.emails.alert.showOnMap, href: first.href }
          : { label: fi.emails.alert.openAll, href: listUrl }
      }
      note={copy.note}
      footerWhy={copy.footerWhy(watchAreaName)}
      baseUrl={baseUrl}
      unsubscribeUrl={unsubscribeUrl}
      attribution={attribution}
    >
      {shown.map((item, index) => (
        <AlertDetails
          key={item.declarationNumber}
          item={item}
          timeZone={timeZone}
          showLink={!single}
          divider={index > 0}
        />
      ))}
      <MoreAlerts count={alerts.length - shown.length} href={listUrl} />
    </EmailLayout>
  )
}

export function renderAlertImmediate(props: AlertImmediateProps): Promise<RenderedEmail> {
  return renderEmail(<AlertImmediate {...props} />)
}
