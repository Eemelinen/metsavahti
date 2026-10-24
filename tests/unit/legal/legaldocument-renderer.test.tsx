import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LegalDocument } from '@/components/legal/legal-document'
import { cookies } from '@/config/cookies'
import { richTextFromSections } from '@/lib/legal/documents'
import { plainText, slugify, splitLegalSections } from '@/lib/legal/legal-sections'
import type { LegalDocument as LegalDocumentData } from '@/payload-types'

const body = richTextFromSections(
  ['Tämä seloste kertoo, mitä tietoja käsittelemme.'],
  [
    { title: 'Rekisterinpitäjä ja yhteystiedot', paragraphs: ['Metsävahti.'] },
    { title: 'Säilytysajat', paragraphs: ['Tilin ajan.', 'Lokit 12 kk.'] },
    { title: 'Säilytysajat', paragraphs: ['Sama otsikko uudelleen.'] },
  ],
)

function doc(overrides: Partial<LegalDocumentData> = {}): LegalDocumentData {
  return {
    id: 1,
    title: 'Tietosuojaseloste',
    slug: 'privacy',
    version: '2026-09',
    // 31.8. 22:30 UTC is 1.9. in Finnish time.
    publishedAt: '2026-08-31T22:30:00.000Z',
    requiresReacceptance: false,
    body,
    updatedAt: '2026-08-31T22:30:00.000Z',
    createdAt: '2026-08-31T22:30:00.000Z',
    ...overrides,
  }
}

describe('splitLegalSections', () => {
  it('splits at h2 headings into slugged sections after the lead', () => {
    const { intro, sections } = splitLegalSections(body)
    expect(intro.map((node) => plainText(node))).toEqual([
      'Tämä seloste kertoo, mitä tietoja käsittelemme.',
    ])
    expect(sections.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'rekisterinpitaja-ja-yhteystiedot', title: 'Rekisterinpitäjä ja yhteystiedot' },
      { id: 'sailytysajat', title: 'Säilytysajat' },
      { id: 'sailytysajat-2', title: 'Säilytysajat' },
    ])
    expect(sections[1]!.nodes.map((node) => plainText(node))).toEqual([
      'Tilin ajan.',
      'Lokit 12 kk.',
    ])
  })

  it('keeps clear of reserved ids and names untitled sections', () => {
    const untitled = richTextFromSections([], [{ title: '  ', paragraphs: [] }])
    expect(splitLegalSections(untitled).sections[0]!.id).toBe('osio')
    expect(splitLegalSections(body, ['sailytysajat']).sections.map((s) => s.id)).toEqual([
      'rekisterinpitaja-ja-yhteystiedot',
      'sailytysajat-2',
      'sailytysajat-3',
    ])
  })

  it('slugifies Finnish text', () => {
    expect(slugify('Mitä tietoja keräämme?')).toBe('mita-tietoja-keraamme')
    expect(slugify('Siirrot EU/ETA-alueen ulkopuolelle')).toBe('siirrot-eu-eta-alueen-ulkopuolelle')
  })
})

describe('LegalDocument', () => {
  it('renders the date, version, title, lead and numbered sections with a matching TOC', () => {
    const html = renderToStaticMarkup(<LegalDocument document={doc()} />)
    expect(html).toContain('Päivitetty 1.9.2026 · Versio 2026-09')
    expect(html).toMatch(/<h1[^>]*>Tietosuojaseloste<\/h1>/)
    expect(html).toContain('Tämä seloste kertoo, mitä tietoja käsittelemme.')
    for (const [index, id, title] of [
      [1, 'rekisterinpitaja-ja-yhteystiedot', 'Rekisterinpitäjä ja yhteystiedot'],
      [2, 'sailytysajat', 'Säilytysajat'],
      [3, 'sailytysajat-2', 'Säilytysajat'],
    ] as const) {
      expect(html).toContain(`href="#${id}"`)
      expect(html).toContain(`<section aria-labelledby="${id}-otsikko"`)
      expect(html).toMatch(new RegExp(`id="${id}"`))
      expect(html).toMatch(new RegExp(`id="${id}-otsikko">${index}. ${title}</h2>`))
    }
  })

  it('renders lists and links from the rich text', () => {
    const withList = doc({
      body: {
        root: {
          ...body.root,
          children: [
            ...body.root.children,
            {
              type: 'list',
              listType: 'bullet',
              tag: 'ul',
              version: 1,
              children: [
                {
                  type: 'listitem',
                  version: 1,
                  value: 1,
                  children: [
                    {
                      type: 'link',
                      version: 1,
                      fields: { url: 'https://tietosuoja.fi', newTab: true, linkType: 'custom' },
                      children: [
                        { type: 'text', version: 1, text: 'Tietosuojavaltuutettu', format: 0 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    })
    const html = renderToStaticMarkup(<LegalDocument document={withList} />)
    expect(html).toMatch(
      /<ul class="list-disc[^"]*"><li[^>]*><a [^>]*href="https:\/\/tietosuoja.fi"/,
    )
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('styles autolinks and never renders a body heading as a second h1', () => {
    const text = (t: string) => ({ type: 'text', version: 1, text: t, format: 0 })
    const html = renderToStaticMarkup(
      <LegalDocument
        document={doc({
          body: {
            root: {
              ...body.root,
              children: [
                ...body.root.children,
                { type: 'heading', tag: 'h1', version: 1, children: [text('Väliotsikko')] },
                {
                  type: 'paragraph',
                  version: 1,
                  children: [
                    {
                      type: 'autolink',
                      version: 1,
                      fields: { url: 'https://metsavahti.fi', linkType: 'custom' },
                      children: [text('metsavahti.fi')],
                    },
                  ],
                },
              ],
            },
          },
        })}
      />,
    )
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toMatch(/<h3 [^>]*>Väliotsikko<\/h3>/)
    expect(html).toMatch(/<a class="text-forest-600[^"]*" href="https:\/\/metsavahti.fi">/)
  })

  it('puts extra sections first, numbered and listed with the rest', () => {
    const html = renderToStaticMarkup(
      <LegalDocument
        actions={<button type="button">Avaa evästeasetukset</button>}
        document={doc({
          body: richTextFromSections([], [{ title: 'Suostumuksen hallinta', paragraphs: ['…'] }]),
        })}
        extraSections={[
          { id: 'kaytetyt-evasteet', title: 'Käytetyt evästeet', content: <table /> },
        ]}
      />,
    )
    const toc = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
    expect(toc).toEqual(['kaytetyt-evasteet', 'suostumuksen-hallinta'])
    expect(html).toContain('1. Käytetyt evästeet')
    expect(html).toContain('2. Suostumuksen hallinta')
    expect(html).toContain('Avaa evästeasetukset')
  })

  it('leaves out the TOC when the document has no sections', () => {
    const html = renderToStaticMarkup(
      <LegalDocument document={doc({ body: richTextFromSections(['Luonnos.'], []) })} />,
    )
    expect(html).not.toContain('data-testid="legal-toc"')
    expect(html).toContain('Luonnos.')
  })
})

describe('config/cookies', () => {
  it('lists the session and consent cookies with their real lifetimes', () => {
    expect(cookies.map(({ name, category, lifetime }) => ({ name, category, lifetime }))).toEqual([
      { name: 'payload-token', category: 'necessary', lifetime: '1 pv / 30 pv (Muista minut)' },
      { name: 'mv_consent', category: 'necessary', lifetime: '12 kk' },
    ])
  })
})
