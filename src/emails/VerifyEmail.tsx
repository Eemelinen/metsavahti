import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'

const copy = fi.emails.verify

/** Subject line (Email artboard template 1). */
export const VERIFY_EMAIL_SUBJECT = copy.subject

/** The page MV-043 builds; the token is Payload's `_verificationToken`. */
export function verifyEmailUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/vahvista?token=${encodeURIComponent(token)}`
}

export type VerifyEmailProps = {
  token: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the CTA and the footer links derive from it. */
  baseUrl: string
  attribution?: string
}

/**
 * "Vahvista sähköpostiosoitteesi" (Email artboard template 1, MV-042): sent by Payload when
 * an account is created (`Users.auth.verify`) and again by the resend action (MV-043).
 * The artboard hides the attribution on this template; the layout keeps it because every
 * email must carry the Metsäkeskus line (AGENTS.md).
 */
export function VerifyEmail({ token, baseUrl, attribution }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview={copy.preview}
      badge={{ label: copy.badge, tone: 'forest' }}
      heading={copy.heading}
      lead={copy.lead}
      cta={{ label: copy.cta, href: verifyEmailUrl(baseUrl, token), showFallback: true }}
      note={copy.note}
      footerWhy={copy.footerWhy}
      baseUrl={baseUrl}
      attribution={attribution}
    />
  )
}

export function renderVerifyEmail(props: VerifyEmailProps): Promise<RenderedEmail> {
  return renderEmail(<VerifyEmail {...props} />)
}
