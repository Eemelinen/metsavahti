import { DetailRows, MessageBlock } from '@/emails/DetailRows'
import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'
import type { DataRequestType } from '@/lib/public-forms/public-forms-schema'

const copy = fi.emails.dataRequestReceived

export type DataRequestReceivedProps = {
  /** Short id shared with the requester's confirmation, so the two can be matched. */
  reference: string
  type: DataRequestType
  email: string
  message: string
  /** When the form was sent, already formatted in Finnish time. */
  receivedAt: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the footer's privacy link derives from it. */
  baseUrl: string
  attribution?: string
}

/** "Tarkastus" / "Poisto" / "Muu pyyntö", the labels of the form's radio cards. */
export function dataRequestTypeLabel(type: DataRequestType): string {
  return fi.publicForms.dataRequest.types[type].label
}

export function dataRequestReceivedSubject(reference: string): string {
  return copy.subject(reference)
}

/**
 * Internal "Uusi tietopyyntö" (`03-pages.md` `DataRequestReceived`, MV-095): a data subject
 * request from `/tietopyynto`, to `DPO_EMAIL`, with `Reply-To` set to the requester and the
 * reference the requester's confirmation carries. The 30-day answer period is in the lead.
 */
export function DataRequestReceived({
  reference,
  type,
  email,
  message,
  receivedAt,
  baseUrl,
  attribution,
}: DataRequestReceivedProps) {
  return (
    <EmailLayout
      preview={copy.preview}
      badge={{ label: dataRequestTypeLabel(type), tone: type === 'erasure' ? 'ember' : 'forest' }}
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
          [copy.email, email],
          [copy.receivedAt, receivedAt],
        ]}
      />
      <MessageBlock label={copy.message} text={message} />
    </EmailLayout>
  )
}

export function renderDataRequestReceived(props: DataRequestReceivedProps): Promise<RenderedEmail> {
  return renderEmail(<DataRequestReceived {...props} />)
}
