import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

import { metsakeskusAttribution } from '@/lib/attribution'
import { colors, fontFamily, radius } from '@/lib/design-tokens'

/** Badge colour pairs from the artboard (docs/design/Email.dc.html#layout). */
export type EmailBadgeTone = 'forest' | 'neutral' | 'ember' | 'amber'

const BADGE_TONES: Record<EmailBadgeTone, { background: string; color: string }> = {
  forest: { background: colors.forest[50], color: colors.forest[700] },
  neutral: { background: colors.paper.sunken, color: colors.ink.muted },
  ember: { background: colors.ember[100], color: colors.ember[700] },
  amber: { background: colors.amber[100], color: colors.amber[700] },
}

/** Routes the footer links point at (03 §Routes). */
export const EMAIL_SETTINGS_PATH = '/tili/ilmoitukset'
export const EMAIL_PRIVACY_PATH = '/tietosuoja'

export type EmailLayoutProps = {
  /** Preheader shown by mail clients next to the subject. */
  preview: string
  badge?: { label: string; tone: EmailBadgeTone }
  heading: string
  lead?: string
  /** Template-specific body (tables, rows) rendered between the lead and the CTA. */
  children?: ReactNode
  /** Primary button. `showFallback` prints the URL below it for clients that drop links. */
  cta?: { label: string; href: string; showFallback?: boolean }
  /** Grey box under the CTA: legal or "if this was not you" copy. */
  note?: string
  /** First footer line: why the recipient got this message. */
  footerWhy: string
  /** Absolute origin for the footer links (`env.NEXT_PUBLIC_SERVER_URL`). */
  baseUrl: string
  /** Per-area opt-out link (signed token, MV-073); rendered only when present. */
  unsubscribeUrl?: string
  /** Metsäkeskus attribution line; defaults to the current month (CC BY 4.0, README). */
  attribution?: string
}

const cell = { padding: '0 24px' } as const
const muted = { margin: 0, fontSize: 13, lineHeight: 1.5, color: colors.ink.muted } as const
const footerLink = { color: colors.ink.muted } as const

/**
 * Shared frame for every transactional email (MV-040): brand header, badge, heading, lead,
 * template body, CTA, note and the footer with the settings link, the privacy link and the
 * attribution line. Inline styles are required by mail clients; colours come from
 * `src/lib/design-tokens.ts` (docs/design/README.md rule 3).
 */
export function EmailLayout({
  preview,
  badge,
  heading,
  lead,
  children,
  cta,
  note,
  footerWhy,
  baseUrl,
  unsubscribeUrl,
  attribution = metsakeskusAttribution(),
}: EmailLayoutProps) {
  const settingsUrl = `${baseUrl}${EMAIL_SETTINGS_PATH}`
  const privacyUrl = `${baseUrl}${EMAIL_PRIVACY_PATH}`
  return (
    <Html lang="fi">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: '24px 12px 48px',
          fontFamily: fontFamily.sans,
          backgroundColor: colors.paper.sunken,
          color: colors.ink.DEFAULT,
        }}
      >
        <Container style={{ maxWidth: 600 }}>
          <Section
            style={{
              backgroundColor: colors.paper.raised,
              border: `1px solid ${colors.line.DEFAULT}`,
              borderRadius: radius.xl,
            }}
          >
            <Section
              style={{ padding: '20px 24px', borderBottom: `1px solid ${colors.line.DEFAULT}` }}
            >
              <Row>
                <Column style={{ width: 28 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: radius.md,
                      backgroundColor: colors.forest[700],
                      textAlign: 'center',
                      lineHeight: '28px',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: colors.amber[300],
                        verticalAlign: 'middle',
                      }}
                    />
                  </div>
                </Column>
                <Column
                  style={{
                    paddingLeft: 10,
                    fontWeight: 700,
                    fontSize: 18,
                    color: colors.forest[700],
                  }}
                >
                  Metsävahti
                </Column>
              </Row>
            </Section>

            <Section style={{ padding: '24px 24px 8px' }}>
              {badge ? (
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 999,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    ...BADGE_TONES[badge.tone],
                  }}
                >
                  {badge.label}
                </span>
              ) : null}
              <Heading
                as="h1"
                style={{
                  margin: '14px 0 8px',
                  fontSize: 24,
                  lineHeight: 1.2,
                  color: colors.forest[700],
                  letterSpacing: '-0.01em',
                }}
              >
                {heading}
              </Heading>
              {lead ? (
                <Text style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: colors.ink.muted }}>
                  {lead}
                </Text>
              ) : null}
            </Section>

            {children}

            {cta ? (
              <Section style={{ padding: '16px 24px 8px' }}>
                <Button
                  href={cta.href}
                  style={{
                    display: 'block',
                    backgroundColor: colors.forest[700],
                    color: colors.paper.raised,
                    textAlign: 'center',
                    padding: 16,
                    borderRadius: radius.lg,
                    fontWeight: 700,
                    fontSize: 16,
                    textDecoration: 'none',
                  }}
                >
                  {cta.label}
                </Button>
              </Section>
            ) : null}
            {cta?.showFallback ? (
              <Section style={{ padding: '0 24px 8px' }}>
                <Text
                  style={{
                    ...muted,
                    fontSize: 12,
                    color: colors.ink.faint,
                    wordBreak: 'break-all',
                  }}
                >
                  Jos painike ei toimi, kopioi osoite selaimeen:
                  <br />
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: colors.ink.muted }}>
                    {cta.href}
                  </span>
                </Text>
              </Section>
            ) : null}
            {note ? (
              <Section style={{ padding: '8px 24px 24px' }}>
                <Text
                  style={{
                    ...muted,
                    backgroundColor: colors.paper.DEFAULT,
                    borderRadius: radius.md,
                    padding: '12px 14px',
                  }}
                >
                  {note}
                </Text>
              </Section>
            ) : null}
          </Section>

          <Section style={{ padding: '20px 16px 0' }}>
            <Text
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.6,
                color: colors.ink.faint,
                textAlign: 'center',
              }}
            >
              {footerWhy}
              <br />
              <Link href={settingsUrl} style={footerLink}>
                Ilmoitusasetukset
              </Link>
              {unsubscribeUrl ? (
                <>
                  {' · '}
                  <Link href={unsubscribeUrl} style={footerLink}>
                    Lopeta tämän alueen ilmoitukset
                  </Link>
                </>
              ) : null}
              {' · '}
              <Link href={privacyUrl} style={footerLink}>
                Tietosuojaseloste
              </Link>
              <br />
              <br />
              {attribution}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/** Padding for template body sections so they line up with the layout's own columns. */
export const emailBodyCell = cell
