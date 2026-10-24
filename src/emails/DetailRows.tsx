import { Column, Row, Section, Text } from '@react-email/components'

import { colors, radius } from '@/lib/design-tokens'

const label = { padding: '10px 0', color: colors.ink.muted, width: '40%' } as const
const value = { padding: '10px 0', wordBreak: 'break-word' } as const
const divided = { borderBottom: `1px solid ${colors.paper.sunken}` } as const

/** Label / value table of a template body, as in `AccountDeleted` (Email artboard template 6). */
export function DetailRows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <Section
      style={{ padding: '8px 24px', fontSize: 15, lineHeight: 1.45, color: colors.ink.DEFAULT }}
    >
      {rows.map(([name, text], index) => {
        const last = index === rows.length - 1
        return (
          <Row key={name}>
            <Column style={{ ...label, ...(last ? {} : divided) }}>{name}</Column>
            <Column style={{ ...value, ...(last ? {} : divided) }}>{text}</Column>
          </Row>
        )
      })}
    </Section>
  )
}

/**
 * A visitor's free text as typed, line breaks kept. React escapes it, so markup in a message
 * arrives as text, never as HTML.
 */
export function MessageBlock({ label: heading, text }: { label: string; text: string }) {
  return (
    <Section style={{ padding: '8px 24px 16px' }}>
      <Text style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: colors.ink.muted }}>
        {heading}
      </Text>
      <Text
        style={{
          margin: 0,
          padding: '12px 14px',
          fontSize: 15,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: colors.ink.DEFAULT,
          backgroundColor: colors.paper.DEFAULT,
          borderRadius: radius.md,
        }}
      >
        {text}
      </Text>
    </Section>
  )
}
