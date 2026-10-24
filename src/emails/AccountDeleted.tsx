import { Column, Row, Section } from '@react-email/components'

import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'
import { colors } from '@/lib/design-tokens'

const copy = fi.emails.accountDeleted

/** Subject line (Email artboard template 6). */
export const ACCOUNT_DELETED_SUBJECT = copy.subject

export type AccountDeletedProps = {
  /** How many watch areas went with the account, for the "Poistettu" row. */
  watchAreas: number
  /** When the person asked for the deletion, already formatted in the account's time zone. */
  deletedAt: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the footer's privacy link derives from it. */
  baseUrl: string
  attribution?: string
}

const label = { padding: '10px 0', color: colors.ink.muted, width: '45%' } as const
const value = { padding: '10px 0' } as const
const divided = { borderBottom: `1px solid ${colors.paper.sunken}` } as const

/**
 * "Tilisi on poistettu" (Email artboard template 6, MV-094): the last message to the address,
 * sent by the `delete-account` job before it deletes anything (`01 §4.6`). No CTA and no
 * settings link, since there is no account left; the artboard hides the attribution, the
 * layout keeps it because every email must carry it (AGENTS.md).
 */
export function AccountDeleted({
  watchAreas,
  deletedAt,
  baseUrl,
  attribution,
}: AccountDeletedProps) {
  const rows = [
    [copy.deleted, copy.deletedValue(watchAreas)],
    [copy.kept, copy.keptValue],
    [copy.at, deletedAt],
  ] as const
  return (
    <EmailLayout
      preview={copy.preview}
      heading={copy.heading}
      lead={copy.lead}
      note={copy.note}
      footerWhy={copy.footerWhy}
      baseUrl={baseUrl}
      showSettingsLink={false}
      attribution={attribution}
    >
      <Section
        style={{ padding: '8px 24px', fontSize: 15, lineHeight: 1.45, color: colors.ink.DEFAULT }}
      >
        {rows.map(([name, text], index) => (
          <Row key={name}>
            <Column style={{ ...label, ...(index < rows.length - 1 ? divided : {}) }}>
              {name}
            </Column>
            <Column style={{ ...value, ...(index < rows.length - 1 ? divided : {}) }}>
              {text}
            </Column>
          </Row>
        ))}
      </Section>
    </EmailLayout>
  )
}

export function renderAccountDeleted(props: AccountDeletedProps): Promise<RenderedEmail> {
  return renderEmail(<AccountDeleted {...props} />)
}
