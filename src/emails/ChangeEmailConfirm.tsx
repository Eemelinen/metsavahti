import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'

const copy = fi.emails.changeEmail

/** Subject line (Email artboard template 7). */
export const CHANGE_EMAIL_SUBJECT = copy.subject

/** The confirmation page (`03-pages.md`); the token is the signed `email-change` link. */
export function changeEmailUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/vaihda-sahkoposti/vahvista?token=${encodeURIComponent(token)}`
}

export type ChangeEmailConfirmProps = {
  /** The requested address, which this message is sent to. */
  newEmail: string
  token: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the CTA and the footer links derive from it. */
  baseUrl: string
  attribution?: string
}

/**
 * "Vahvista uusi sähköpostiosoite" (Email artboard template 7, MV-052): sent to the new
 * address when a signed-in user asks to change theirs on `/tili`. The link applies the change.
 * The artboard hides the attribution on this template; the layout keeps it because every email
 * must carry the Metsäkeskus line (AGENTS.md).
 */
export function ChangeEmailConfirm({
  newEmail,
  token,
  baseUrl,
  attribution,
}: ChangeEmailConfirmProps) {
  return (
    <EmailLayout
      preview={copy.preview}
      badge={{ label: copy.badge, tone: 'neutral' }}
      heading={copy.heading}
      lead={copy.lead(newEmail)}
      cta={{ label: copy.cta, href: changeEmailUrl(baseUrl, token), showFallback: true }}
      note={copy.note}
      footerWhy={copy.footerWhy}
      baseUrl={baseUrl}
      attribution={attribution}
    />
  )
}

export function renderChangeEmailConfirm(props: ChangeEmailConfirmProps): Promise<RenderedEmail> {
  return renderEmail(<ChangeEmailConfirm {...props} />)
}
