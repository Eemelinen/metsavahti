import type { LegalDocument } from '@/payload-types'

type RichText = LegalDocument['body']
/** A top-level node of a legal document's Lexical body. */
export type LegalNode = RichText['root']['children'][number]

export type LegalSection = {
  /** Fragment id of the `<section>`, the target of its TOC link. */
  id: string
  /** Plain text of the `h2` that opens the section. */
  title: string
  /** The nodes between this `h2` and the next one. */
  nodes: LegalNode[]
}

export type LegalSections = {
  /** Nodes before the first `h2` (the lead paragraph). */
  intro: LegalNode[]
  sections: LegalSection[]
}

function isSectionHeading(node: LegalNode): boolean {
  return node.type === 'heading' && node.tag === 'h2'
}

/** Concatenated `text` of a node and its descendants (headings are rendered as plain text). */
export function plainText(node: Record<string, unknown>): string {
  if (typeof node.text === 'string') return node.text
  if (!Array.isArray(node.children)) return ''
  return node.children.map((child: Record<string, unknown>) => plainText(child)).join('')
}

/** `Rekisterinpitäjä ja yhteystiedot` → `rekisterinpitaja-ja-yhteystiedot`. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Split a legal document's body at its `h2` headings (MV-091): each `h2` opens a section that
 * the page renders as `<section id>` and lists in the table of contents. Ids are slugs of the
 * heading text, so links such as `/tietosuoja#sailytysajat` survive a new version as long as
 * the heading does; repeated or empty slugs get a numeric suffix. `reservedIds` are ids the
 * page already uses for sections of its own (the cookie table on `/evasteet`).
 */
export function splitLegalSections(
  body: RichText,
  reservedIds: readonly string[] = [],
): LegalSections {
  const used = new Set(reservedIds)
  const uniqueId = (title: string) => {
    const base = slugify(title) || 'osio'
    let id = base
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
    used.add(id)
    return id
  }

  const intro: LegalNode[] = []
  const sections: LegalSection[] = []
  for (const node of body.root.children) {
    if (isSectionHeading(node)) {
      const title = plainText(node).trim()
      sections.push({ id: uniqueId(title), title, nodes: [] })
    } else if (sections.length > 0) {
      sections[sections.length - 1]!.nodes.push(node)
    } else {
      intro.push(node)
    }
  }
  return { intro, sections }
}
