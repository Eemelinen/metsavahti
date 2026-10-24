import { Column, Img, Link, Row, Section, Text } from '@react-email/components'
import type { ReactNode } from 'react'

import { emailBodyCell } from '@/emails/EmailLayout'
import { fi } from '@/i18n/fi'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { colors, radius } from '@/lib/design-tokens'
import { cuttingType } from '@/lib/wfs/codes'
import type { AlertChangeType } from '@/payload/collections/Alerts'

const copy = fi.emails.alert

/** One alert as both alert templates show it; URLs are absolute and already signed. */
export type AlertEmailItem = {
  /** `/ilmoitukset/[id]` of the alert. */
  href: string
  changeType: AlertChangeType
  declarationNumber: string
  cuttingTypeCode: number | null
  areaHa: number | null
  /** Watch-area centre → polygon (`watch_area_declarations.distance_m`), 0 when it covers it. */
  distanceM: number
  receivedAt: string | null
  /** The static map image (MV-077); only when `ENABLE_MAP_IMAGES` is on. */
  mapImageUrl?: string
}

/**
 * Rows an email lists per watch area before it points to the alert list instead: keeps the
 * HTML well under Gmail's ~102 KB clipping limit (the unit test checks the worst case).
 */
export const MAX_ALERT_ROWS = 10

/** Rows a whole digest lists, however many areas it covers (the same size budget). */
export const MAX_DIGEST_ROWS = 40

/** The map image's box inside the 600 px card (24 px padding each side), 600 × 320 scaled. */
const MAP_WIDTH = 552
const MAP_HEIGHT = 294

const KM_FORMAT = new Intl.NumberFormat('fi-FI', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** "noin 350 m tontistasi", "noin 1,2 km tontistasi"; "tonttisi kohdalla" at distance 0. */
export function alertDistanceText(distanceM: number): string {
  if (distanceM <= 0) return copy.atPlot
  const metres = Math.max(10, Math.round(distanceM / 10) * 10)
  return copy.distanceFromPlot(
    metres >= 1000 ? `${KM_FORMAT.format(distanceM / 1000)} km` : `${metres} m`,
  )
}

/** "3,4 ha" (two decimals under a hectare); "– ha" when the source left the area out. */
export function formatAlertArea(areaHa: number | null): string {
  if (areaHa == null) return '– ha'
  const digits = areaHa < 1 ? 2 : 1
  return `${areaHa.toLocaleString('fi-FI', { maximumFractionDigits: digits })} ha`
}

/** "5.9.2026" (or "5.9." with `short`) in the account's time zone; "–" without a date. */
export function formatAlertDate(
  iso: string | Date | null,
  timeZone: string = DEFAULT_TIMEZONE,
  short = false,
): string {
  if (!iso) return '–'
  const parts = new Intl.DateTimeFormat('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    ...(short ? {} : { year: 'numeric' }),
    timeZone,
  }).format(new Date(iso))
  return short ? `${parts.replace(/\.$/, '')}.` : parts
}

const label = { padding: '10px 0', color: colors.ink.muted, width: '45%' } as const
const value = { padding: '10px 0', fontWeight: 700 } as const
const divided = { borderBottom: `1px solid ${colors.paper.sunken}` } as const
const textLink = {
  fontSize: 14,
  fontWeight: 700,
  color: colors.forest[600],
  textDecoration: 'none',
} as const

function Swatch({ code }: { code: number | null }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: 2,
        marginRight: 8,
        verticalAlign: 'middle',
        backgroundColor: colors.cut[cuttingType(code).colourToken],
      }}
    />
  )
}

/**
 * One alert of `AlertImmediate` (Email artboard template 3): the optional map image, the
 * detail table with the plain-Finnish cutting type and its one-line explanation, and, when the
 * email lists several alerts, its own "Näytä kartalla" link.
 */
export function AlertDetails({
  item,
  timeZone,
  showLink,
  divider,
}: {
  item: AlertEmailItem
  timeZone?: string
  showLink: boolean
  divider: boolean
}) {
  const type = cuttingType(item.cuttingTypeCode)
  const rows: Array<[string, ReactNode]> = [
    [
      copy.cuttingType,
      <>
        <Swatch code={item.cuttingTypeCode} />
        {type.label_fi}
        <br />
        <span style={{ fontWeight: 400, fontSize: 14, color: colors.ink.muted }}>
          {type.explanation_fi}
        </span>
      </>,
    ],
    [copy.area, formatAlertArea(item.areaHa)],
    [copy.distance, alertDistanceText(item.distanceM)],
    [copy.received, formatAlertDate(item.receivedAt, timeZone)],
    ...(item.changeType === 'new'
      ? []
      : ([[copy.change, copy.changeLabel[item.changeType]]] as Array<[string, string]>)),
    [copy.declarationNumber, item.declarationNumber],
  ]
  return (
    <Section
      data-testid="alert-item"
      style={{
        padding: '16px 24px 8px',
        ...(divider ? { borderTop: `1px solid ${colors.line.DEFAULT}` } : {}),
      }}
    >
      {item.mapImageUrl ? (
        <Img
          src={item.mapImageUrl}
          alt={copy.mapAlt}
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: MAP_WIDTH,
            height: 'auto',
            borderRadius: radius.lg,
            border: `1px solid ${colors.line.DEFAULT}`,
            marginBottom: 8,
          }}
        />
      ) : null}
      <Section style={{ fontSize: 15, lineHeight: 1.45, color: colors.ink.DEFAULT }}>
        {rows.map(([name, content], index) => {
          const last = index === rows.length - 1
          return (
            <Row key={name}>
              <Column style={{ ...label, ...(last ? {} : divided) }}>{name}</Column>
              <Column style={{ ...value, ...(last ? {} : divided) }}>
                {/* Separates label and value in the plain-text part; HTML collapses it. */}{' '}
                {content}
              </Column>
            </Row>
          )
        })}
      </Section>
      {showLink ? (
        <Text style={{ margin: '8px 0 0' }}>
          <Link href={item.href} style={textLink}>
            {copy.showOnMap} →
          </Link>
        </Text>
      ) : null}
    </Section>
  )
}

/** One compact row of `AlertDigest` (Email artboard template 4): colour bar, facts, map link. */
export function DigestItem({ item, timeZone }: { item: AlertEmailItem; timeZone?: string }) {
  const type = cuttingType(item.cuttingTypeCode)
  const facts = [
    alertDistanceText(item.distanceM),
    copy.receivedShort(formatAlertDate(item.receivedAt, timeZone, true)),
    ...(item.changeType === 'new' ? [] : [copy.changeLabel[item.changeType]]),
  ]
  return (
    <Section
      data-testid="alert-item"
      style={{
        border: `1px solid ${colors.line.DEFAULT}`,
        borderRadius: radius.lg,
        marginBottom: 8,
      }}
    >
      <Row>
        <Column
          style={{
            width: 10,
            backgroundColor: colors.cut[type.colourToken],
            borderRadius: `${radius.lg} 0 0 ${radius.lg}`,
          }}
        />
        <Column style={{ padding: '12px 14px', fontSize: 14, lineHeight: 1.45 }}>
          <strong>{type.label_fi}</strong> · {formatAlertArea(item.areaHa)}
          <br />
          <span style={{ color: colors.ink.muted }}>{facts.join(' · ')}</span>
          <br />
          <span style={{ fontSize: 13, color: colors.ink.muted }}>{type.explanation_fi}</span>
        </Column>
        <Column
          style={{
            padding: '12px 14px',
            textAlign: 'right',
            whiteSpace: 'nowrap',
            verticalAlign: 'top',
          }}
        >
          <Link href={item.href} style={{ ...textLink, fontSize: 13 }}>
            {copy.onMapLink}
          </Link>
        </Column>
      </Row>
    </Section>
  )
}

/** "Lisäksi N ilmoitusta …" under a list cut at `MAX_ALERT_ROWS`, linking the alert list. */
export function MoreAlerts({ count, href }: { count: number; href: string }) {
  if (count <= 0) return null
  return (
    <Section style={{ ...emailBodyCell, paddingBottom: 8 }}>
      <Text style={{ margin: 0, fontSize: 14 }}>
        <Link href={href} style={textLink}>
          {copy.more(count)}
        </Link>
      </Text>
    </Section>
  )
}
