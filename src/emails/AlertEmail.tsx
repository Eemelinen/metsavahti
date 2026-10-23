import { Section, Text } from '@react-email/components'

import { EmailLayout, emailBodyCell } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { colors } from '@/lib/design-tokens'
import { hakkuutapaLabel } from '@/lib/wfs/hakkuutapa'
import type { AlertChangeType } from '@/payload/collections/Alerts'

const CHANGE_LABEL: Record<AlertChangeType, string> = {
  new: '',
  geometry_changed: ' (rajaus muuttunut)',
  attributes_changed: ' (tiedot muuttuneet)',
  removed: ' (poistunut aineistosta)',
}

export type AlertEmailDeclaration = {
  declarationNumber: string
  hakkuutapa: number | null
  areaHa: number | null
  distanceM: number
  changeType: AlertChangeType
}

export type AlertEmailProps = {
  watchAreaName: string
  declarations: AlertEmailDeclaration[]
  /** `env.NEXT_PUBLIC_SERVER_URL`; the CTA opens the dashboard and the footer links derive from it. */
  baseUrl: string
  attribution: string
}

/** Immediate alert email (template 3 of the artboard; per-row map + table arrive with MV-073). */
export function AlertEmail({ watchAreaName, declarations, baseUrl, attribution }: AlertEmailProps) {
  const count = declarations.length
  return (
    <EmailLayout
      preview={`${count} uutta tai muuttunutta metsänkäyttöilmoitusta alueella ${watchAreaName}`}
      badge={{ label: 'Uusi ilmoitus', tone: 'ember' }}
      heading={`Uusia metsänkäyttöilmoituksia vahtialueellasi ${watchAreaName}`}
      lead={`Vahtialueesi läheltä löytyi ${count} metsänkäyttöilmoitusta, jotka ovat uusia tai muuttuneet edellisen tarkistuksen jälkeen.`}
      cta={{ label: 'Avaa Metsävahti', href: `${baseUrl}/dashboard` }}
      note="Metsänkäyttöilmoitus on hakkuuaikomus, ei velvoite hakata. Hakkuu voi alkaa aikaisintaan 10 päivää ilmoituksesta, ja ilmoitus on voimassa kolme vuotta."
      footerWhy={`Saat tämän viestin, koska seuraat aluetta ”${watchAreaName}”.`}
      baseUrl={baseUrl}
      attribution={attribution}
    >
      <Section style={emailBodyCell}>
        {declarations.map((d, index) => (
          <Text
            key={d.declarationNumber}
            data-testid="alert-declaration"
            style={{
              margin: 0,
              padding: '10px 0',
              fontSize: 15,
              lineHeight: 1.45,
              borderBottom: index < count - 1 ? `1px solid ${colors.paper.sunken}` : undefined,
            }}
          >
            <strong>{d.declarationNumber}</strong> · {hakkuutapaLabel(d.hakkuutapa)}
            {d.areaHa != null ? ` · ${d.areaHa.toFixed(2)} ha` : ''} · {Math.round(d.distanceM)} m
            vahtialueesta
            {CHANGE_LABEL[d.changeType]}
          </Text>
        ))}
      </Section>
    </EmailLayout>
  )
}

export function renderAlertEmail(props: AlertEmailProps): Promise<RenderedEmail> {
  return renderEmail(<AlertEmail {...props} />)
}
