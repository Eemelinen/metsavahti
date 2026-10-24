import { describe, expect, it } from 'vitest'

import { plans } from '@/config/plans'
import { FAQ } from '@/content/faq'
import { USER_ROUTE_PREFIXES } from '@/lib/auth/route-protection'
import {
  SITEMAP_ROUTES,
  absoluteUrl,
  faqPageJsonLd,
  organizationJsonLd,
  robotsConfig,
  serializeJsonLd,
  sitemapEntries,
} from '@/lib/seo'

const BASE = 'https://metsavahti.example'

describe('sitemap.xml entries (MV-100)', () => {
  it('lists exactly the marketing and legal pages, landing first', () => {
    expect(sitemapEntries(BASE).map((entry) => entry.url)).toEqual([
      'https://metsavahti.example/',
      'https://metsavahti.example/yhteystiedot',
      'https://metsavahti.example/tietopyynto',
      'https://metsavahti.example/tietosuoja',
      'https://metsavahti.example/kayttoehdot',
      'https://metsavahti.example/evasteet',
      'https://metsavahti.example/saavutettavuus',
    ])
    expect(sitemapEntries(BASE)[0]).toMatchObject({ changeFrequency: 'weekly', priority: 1 })
  })

  it('never lists a signed-in, auth, admin or API route', () => {
    const forbidden = [...USER_ROUTE_PREFIXES, '/admin', '/api', '/kirjaudu', '/rekisteroidy']
    const leaked = SITEMAP_ROUTES.filter(({ path }) =>
      forbidden.some((prefix) => path.startsWith(prefix)),
    )
    expect(leaked).toEqual([])
  })

  it('builds the same URLs whether or not the base ends in a slash', () => {
    expect(sitemapEntries(`${BASE}/`)).toEqual(sitemapEntries(BASE))
    expect(absoluteUrl('http://localhost:3000', '/sitemap.xml')).toBe(
      'http://localhost:3000/sitemap.xml',
    )
  })

  it('gives every entry a priority between 0 and 1', () => {
    for (const entry of sitemapEntries(BASE)) {
      expect(entry.priority).toBeGreaterThan(0)
      expect(entry.priority).toBeLessThanOrEqual(1)
    }
  })
})

describe('robots.txt', () => {
  it('allows the site, keeps the admin, the API and the app pages out and names the sitemap', () => {
    const robots = robotsConfig(BASE)
    expect(robots.sitemap).toBe('https://metsavahti.example/sitemap.xml')
    expect(robots.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/api/',
        '/aloita',
        '/dashboard',
        '/vahtialueet',
        '/ilmoitukset',
        '/tili',
      ],
    })
  })
})

describe('FAQ content', () => {
  it('has the eight questions of the ticket with unique anchors', () => {
    expect(FAQ).toHaveLength(8)
    expect(new Set(FAQ.map((entry) => entry.id)).size).toBe(8)
    for (const entry of FAQ) {
      expect(entry.question).toMatch(/\?$/)
      expect(entry.answer.length).toBeGreaterThan(40)
    }
  })

  it('takes its numbers from the config it describes', () => {
    const answers = FAQ.map((entry) => entry.answer).join('\n')
    expect(answers).toContain(`enintään ${plans.free.maxWatchAreas} vahtialuetta`)
    expect(answers).toContain('100 m – 5 km')
    expect(answers).toContain('CC BY 4.0')
  })
})

describe('structured data', () => {
  it('describes the organisation with its absolute URL', () => {
    expect(organizationJsonLd(BASE)).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Metsävahti',
      url: 'https://metsavahti.example/',
    })
  })

  it('turns every FAQ entry into a Question with its accepted answer', () => {
    const data = faqPageJsonLd(FAQ)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(FAQ.length)
    expect(data.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: FAQ[0]!.question,
      acceptedAnswer: { '@type': 'Answer', text: FAQ[0]!.answer },
    })
  })

  it('escapes < so the data cannot close its script element', () => {
    const json = serializeJsonLd({ text: '</script><script>alert(1)</script>' })
    expect(json).not.toContain('<')
    expect(JSON.parse(json)).toEqual({ text: '</script><script>alert(1)</script>' })
  })
})
