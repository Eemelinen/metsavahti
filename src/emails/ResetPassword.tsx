import { EmailLayout } from '@/emails/EmailLayout'
import { type RenderedEmail, renderEmail } from '@/emails/render'
import { fi } from '@/i18n/fi'

const copy = fi.emails.resetPassword

/** Subject line (Email artboard template 2). */
export const RESET_PASSWORD_SUBJECT = copy.subject

/** The page MV-045 builds; the token is Payload's `resetPasswordToken`. */
export function resetPasswordUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/uusi-salasana?token=${encodeURIComponent(token)}`
}

export type ResetPasswordProps = {
  token: string
  /** `env.NEXT_PUBLIC_SERVER_URL`; the CTA and the footer links derive from it. */
  baseUrl: string
  attribution?: string
}

/**
 * "Salasanan palautus" (Email artboard template 2, MV-045): sent by Payload's
 * `forgotPassword` operation (`Users.auth.forgotPassword`) when `/unohtunut-salasana` names
 * a registered address. The link is valid for one hour and works once. The artboard hides
 * the attribution on this template; the layout keeps it because every email must carry the
 * Metsäkeskus line (AGENTS.md).
 */
export function ResetPassword({ token, baseUrl, attribution }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview={copy.preview}
      badge={{ label: copy.badge, tone: 'neutral' }}
      heading={copy.heading}
      lead={copy.lead}
      cta={{ label: copy.cta, href: resetPasswordUrl(baseUrl, token), showFallback: true }}
      note={copy.note}
      footerWhy={copy.footerWhy}
      baseUrl={baseUrl}
      attribution={attribution}
    />
  )
}

export function renderResetPassword(props: ResetPasswordProps): Promise<RenderedEmail> {
  return renderEmail(<ResetPassword {...props} />)
}
