import { env } from '@/lib/env'

export type EmailProvider = 'nodemailer' | 'resend' | 'none'

/**
 * Which email adapter the configuration selects (`payload.config.ts`): SMTP (Mailpit in
 * dev/test) wins over Resend; without either Payload logs emails to the console. The
 * name is stored in `notification_log.provider` (`01 §3.6`).
 */
export function emailProvider(): EmailProvider {
  if (env.SMTP_HOST) return 'nodemailer'
  if (env.RESEND_API_KEY) return 'resend'
  return 'none'
}
