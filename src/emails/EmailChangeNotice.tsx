import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'

const copy = fi.emails.emailChangeNotice

export const EMAIL_CHANGE_NOTICE_SUBJECT = copy.subject

/** Where the notice sends someone who did not ask for the change. */
export const SECURITY_SETTINGS_PATH = '/tili/turvallisuus'

export type EmailChangeNoticeProps = {
  /** The requested address, named in the message so the owner can recognise it. */
  newEmail: string
  baseUrl: string
  attribution?: string
}

/**
 * The notice to the current address when a change to `newEmail` is requested (MV-052, `01 §7`:
 * "both addresses get a notice"). It carries no link that changes anything; the CTA opens the
 * security settings for an owner who did not ask. The artboard has no template of its own for
 * it, so it reuses template 7's frame and badge.
 */
export function EmailChangeNotice({ newEmail, baseUrl, attribution }: EmailChangeNoticeProps) {
  return (
    <EmailLayout
      preview={copy.preview}
      badge={{ label: copy.badge, tone: 'neutral' }}
      heading={copy.heading}
      lead={copy.lead(newEmail)}
      cta={{ label: copy.cta, href: `${baseUrl}${SECURITY_SETTINGS_PATH}` }}
      note={copy.note}
      footerWhy={copy.footerWhy}
      baseUrl={baseUrl}
      attribution={attribution}
    />
  )
}

export function renderEmailChangeNotice(props: EmailChangeNoticeProps): Promise<RenderedEmail> {
  return renderEmail(<EmailChangeNotice {...props} />)
}
