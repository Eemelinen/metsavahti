import { dataRequestTypeLabel } from '@/emails/DataRequestReceived'
import { DetailRows } from '@/emails/DetailRows'
import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'
import type { DataRequestType } from '@/lib/public-forms/public-forms-schema'

const copy = fi.emails.dataRequestConfirmation

export const DATA_REQUEST_CONFIRMATION_SUBJECT = copy.subject

export type DataRequestConfirmationProps = {
  reference: string
  type: DataRequestType
  /** When the form was sent, already formatted in Finnish time. */
  receivedAt: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the footer's privacy link derives from it. */
  baseUrl: string
  attribution?: string
}

/**
 * "Tietopyyntösi on vastaanotettu" (MV-095): the receipt to the address given on
 * `/tietopyynto`. It repeats the reference, the type and the time but not the message, so
 * the form cannot be used to mail arbitrary text to someone else's address.
 */
export function DataRequestConfirmation({
  reference,
  type,
  receivedAt,
  baseUrl,
  attribution,
}: DataRequestConfirmationProps) {
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
      <DetailRows
        rows={[
          [copy.reference, reference],
          [copy.type, dataRequestTypeLabel(type)],
          [copy.receivedAt, receivedAt],
        ]}
      />
    </EmailLayout>
  )
}

export function renderDataRequestConfirmation(
  props: DataRequestConfirmationProps,
): Promise<RenderedEmail> {
  return renderEmail(<DataRequestConfirmation {...props} />)
}
