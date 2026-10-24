import { DetailRows, MessageBlock } from '@/emails/DetailRows'
import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'

const copy = fi.emails.contactReceived

export type ContactReceivedProps = {
  /** Optional on the form; "(ei annettu)" when empty. */
  name?: string
  email: string
  message: string
  /** When the form was sent, already formatted in Finnish time. */
  receivedAt: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the footer's privacy link derives from it. */
  baseUrl: string
  attribution?: string
}

/** Subject: the sender's name when given, so the inbox shows who wrote. */
export function contactReceivedSubject(name: string | undefined): string {
  return copy.subject(name?.trim() || undefined)
}

/**
 * Internal "Uusi yhteydenotto" (`03-pages.md` `ContactReceived`, MV-095): what a visitor sent
 * from `/yhteystiedot`, to `CONTACT_EMAIL`, with `Reply-To` set to the visitor. No CTA and no
 * settings link (the recipient is the service); the attribution stays (AGENTS.md).
 */
export function ContactReceived({
  name,
  email,
  message,
  receivedAt,
  baseUrl,
  attribution,
}: ContactReceivedProps) {
  return (
    <EmailLayout
      preview={copy.preview}
      badge={{ label: fi.publicForms.contactTab, tone: 'neutral' }}
      heading={copy.heading}
      lead={copy.lead}
      footerWhy={copy.footerWhy}
      baseUrl={baseUrl}
      showSettingsLink={false}
      attribution={attribution}
    >
      <DetailRows
        rows={[
          [copy.name, name?.trim() || copy.noName],
          [copy.email, email],
          [copy.receivedAt, receivedAt],
        ]}
      />
      <MessageBlock label={copy.message} text={message} />
    </EmailLayout>
  )
}

export function renderContactReceived(props: ContactReceivedProps): Promise<RenderedEmail> {
  return renderEmail(<ContactReceived {...props} />)
}
