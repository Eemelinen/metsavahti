import { type JSXConvertersFunction, RichText } from '@payloadcms/richtext-lexical/react'
import type { ReactNode } from 'react'

import { fi } from '@/i18n/fi'
import { DEFAULT_TIMEZONE } from '@/lib/account/timezone'
import { type LegalNode, splitLegalSections } from '@/lib/legal/legal-sections'
import type { LegalDocument as LegalDocumentData } from '@/payload-types'

const copy = fi.legal

/** A section the page adds next to the document's own (the cookie table on `/evasteet`). */
export type ExtraLegalSection = { id: string; title: string; content: ReactNode }

const linkClass = 'text-forest-600 underline hover:text-forest-700'

/** Internal links (to Payload documents) have no page to point at yet, so they render as `#`. */
function LegalLink({
  fields,
  children,
}: {
  fields: { url?: string; newTab?: boolean; linkType?: string }
  children: ReactNode
}) {
  return (
    <a
      className={linkClass}
      href={fields.linkType === 'internal' ? '#' : (fields.url ?? '#')}
      rel={fields.newTab ? 'noopener noreferrer' : undefined}
      target={fields.newTab ? '_blank' : undefined}
    >
      {children}
    </a>
  )
}

/** Token classes for the nodes the legal editor produces (Legal artboard typography). */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  paragraph: ({ node, nodesToJSX }) => (
    <p className="text-pretty">{nodesToJSX({ nodes: node.children })}</p>
  ),
  // Sections are cut at `h2`; any other heading is a sub-heading, never a second page `h1`.
  heading: ({ node, nodesToJSX }) => {
    const Tag = node.tag === 'h1' || node.tag === 'h2' ? 'h3' : node.tag
    return (
      <Tag className="text-lg font-semibold text-forest-700">
        {nodesToJSX({ nodes: node.children })}
      </Tag>
    )
  },
  list: ({ node, nodesToJSX }) => {
    const Tag = node.tag
    const marker = node.listType === 'number' ? 'list-decimal' : 'list-disc'
    return (
      <Tag className={`${marker} flex flex-col gap-1.5 pl-6 leading-normal`}>
        {nodesToJSX({ nodes: node.children })}
      </Tag>
    )
  },
  link: ({ node, nodesToJSX }) => (
    <LegalLink fields={node.fields}>{nodesToJSX({ nodes: node.children })}</LegalLink>
  ),
  autolink: ({ node, nodesToJSX }) => (
    <LegalLink fields={node.fields}>{nodesToJSX({ nodes: node.children })}</LegalLink>
  ),
})

function Body({ nodes, className }: { nodes: LegalNode[]; className: string }) {
  if (nodes.length === 0) return null
  const data = {
    root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: nodes },
  } as const
  return (
    <RichText
      className={`flex flex-col gap-2.5 ${className}`}
      converters={converters}
      data={data}
    />
  )
}

/** `1.9.2026`: the publication day in Finnish time. */
function formatUpdated(publishedAt: string): string {
  return new Intl.DateTimeFormat('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date(publishedAt))
}

/**
 * A published legal document (Legal artboard, `03-pages.md`, MV-091): "Päivitetty" date and
 * version above the title, the body's lead paragraphs, then one numbered `<section>` per `h2`
 * of the rich text, each listed in a sticky table of contents on desktop. `actions` sits under
 * the lead (the "Avaa evästeasetukset" button); `extraSections` come before the document's
 * own sections and are numbered and listed with them.
 */
export function LegalDocument({
  document,
  actions,
  extraSections = [],
}: {
  document: LegalDocumentData
  actions?: ReactNode
  extraSections?: ExtraLegalSection[]
}) {
  const { intro, sections } = splitLegalSections(
    document.body,
    extraSections.map((section) => section.id),
  )
  const all = [
    ...extraSections,
    ...sections.map((section) => ({
      ...section,
      content: <Body className="text-base/relaxed" nodes={section.nodes} />,
    })),
  ]

  return (
    <div className="grid gap-10 py-4 lg:grid-cols-4 lg:items-start">
      {all.length > 0 ? (
        <nav
          aria-label={copy.tocLabel}
          className="hidden text-sm lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-1.5"
          data-testid="legal-toc"
        >
          <span className="mb-1.5 text-xs font-semibold tracking-wider text-ink-muted uppercase">
            {copy.tocLabel}
          </span>
          <ol className="flex flex-col gap-1.5">
            {all.map((section) => (
              <li key={section.id}>
                <a
                  className="block border-l-2 border-line px-2.5 py-1.5 leading-snug text-ink-muted hover:border-forest-600 hover:text-forest-700"
                  href={`#${section.id}`}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <article className="flex max-w-3xl min-w-0 flex-col gap-7 lg:col-span-3">
        <header className="flex flex-col gap-2.5">
          <p className="text-sm text-ink-muted">
            {document.publishedAt ? copy.updated(formatUpdated(document.publishedAt)) : null}
            {document.publishedAt ? ' · ' : null}
            {copy.version(document.version)}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-forest-700">{document.title}</h1>
          <Body className="text-lg text-ink-muted" nodes={intro} />
        </header>
        {actions ? <div>{actions}</div> : null}
        {all.map((section, index) => (
          <section
            aria-labelledby={`${section.id}-otsikko`}
            className="flex scroll-mt-24 flex-col gap-2.5"
            id={section.id}
            key={section.id}
          >
            <h2
              className="text-2xl font-bold tracking-tight text-forest-700"
              id={`${section.id}-otsikko`}
            >
              {index + 1}. {section.title}
            </h2>
            {section.content}
          </section>
        ))}
      </article>
    </div>
  )
}
