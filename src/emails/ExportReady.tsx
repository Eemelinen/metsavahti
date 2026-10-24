import { Column, Row, Section } from '@react-email/components'

import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'
import { colors } from '@/lib/design-tokens'

const copy = fi.emails.exportReady

/** Subject line (Email artboard template 5). */
export const EXPORT_READY_SUBJECT = copy.subject

/** The signed download route (`01 §6`, MV-093); the token is the `data-export` link. */
export function exportDownloadUrl(baseUrl: string, requestId: number, token: string): string {
  return `${baseUrl}/api/account/export/${requestId}?token=${encodeURIComponent(token)}`
}

/** "48 kt" / "1,2 Mt": the archive size the artboard prints in the CTA and the table. */
export function formatArchiveSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kt`
  return `${(bytes / (1024 * 1024)).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} Mt`
}

export type ExportReadyProps = {
  requestId: number
  token: string
  /** The archive's file names, listed under "Sisältö". */
  files: string[]
  sizeBytes: number
  /** When the link stops working, already formatted in the account's time zone. */
  expiresAt: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the CTA and the footer links derive from it. */
  baseUrl: string
  attribution?: string
}

const label = { padding: '10px 0', color: colors.ink.muted, width: '45%' } as const
const value = { padding: '10px 0' } as const
const divided = { borderBottom: `1px solid ${colors.paper.sunken}` } as const

/**
 * "Tietojen vienti on valmis" (Email artboard template 5, MV-093): sent by the `export` job
 * once the archive is stored. The CTA is the signed download link (24 h). The artboard says
 * the link works only when signed in and hides the attribution; here the signed link is the
 * access check (the ticket's `?token=` route) and the layout keeps the Metsäkeskus line
 * because every email must carry it (AGENTS.md).
 */
export function ExportReady({
  requestId,
  token,
  files,
  sizeBytes,
  expiresAt,
  baseUrl,
  attribution,
}: ExportReadyProps) {
  const size = formatArchiveSize(sizeBytes)
  const rows = [
    [copy.contents, files.join(', ')],
    [copy.size, `${size} (zip)`],
    [copy.expires, copy.expiresAt(expiresAt)],
  ] as const
  return (
    <EmailLayout
      preview={copy.preview}
      badge={{ label: copy.badge, tone: 'forest' }}
      heading={copy.heading}
      lead={copy.lead}
      cta={{
        label: copy.cta(size),
        href: exportDownloadUrl(baseUrl, requestId, token),
        showFallback: true,
      }}
      note={copy.note}
      footerWhy={copy.footerWhy}
      baseUrl={baseUrl}
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
            <Column
              style={{
                ...value,
                ...(index < rows.length - 1 ? divided : { fontWeight: 700 }),
              }}
            >
              {text}
            </Column>
          </Row>
        ))}
      </Section>
    </EmailLayout>
  )
}

export function renderExportReady(props: ExportReadyProps): Promise<RenderedEmail> {
  return renderEmail(<ExportReady {...props} />)
}
