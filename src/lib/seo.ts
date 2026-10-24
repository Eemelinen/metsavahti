import type { Metadata, MetadataRoute } from 'next'

import type { FaqEntry } from '@/content/faq'
import { fi } from '@/i18n/fi'
import { USER_ROUTE_PREFIXES } from '@/lib/auth/route-protection'
import { LEGAL_DOCUMENT_PATHS, LEGAL_DOCUMENT_SLUGS } from '@/lib/legal/documents'

/**
 * Search-engine surface (MV-100): what `sitemap.xml` lists, what `robots.txt` keeps crawlers
 * out of and the structured data of the landing page. Pure so the unit test can pin it down;
 * `app/sitemap.ts` and `app/robots.ts` only pass in `NEXT_PUBLIC_SERVER_URL`.
 */

type SitemapRoute = {
  path: string
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>
  priority: number
}

/**
 * Marketing and legal pages only (`03-pages.md` → System routes). MV-101 adds
 * `/miten-se-toimii` and, behind `SHOW_PRICING`, `/hinnoittelu` when it builds them.
 */
export const SITEMAP_ROUTES: readonly SitemapRoute[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/yhteystiedot', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/tietopyynto', changeFrequency: 'yearly', priority: 0.3 },
  ...LEGAL_DOCUMENT_SLUGS.map((slug) => ({
    path: LEGAL_DOCUMENT_PATHS[slug],
    changeFrequency: 'monthly' as const,
    priority: 0.3,
  })),
]

/** Absolute URL of `path` on the site; `baseUrl` may or may not end in a slash. */
export function absoluteUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString()
}

export function sitemapEntries(baseUrl: string): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(baseUrl, path),
    changeFrequency,
    priority,
  }))
}

/** The Payload admin, the API and every page behind a login stay out of search results. */
export function robotsConfig(baseUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', ...USER_ROUTE_PREFIXES] },
    sitemap: absoluteUrl(baseUrl, '/sitemap.xml'),
  }
}

/**
 * Open Graph defaults every frontend page inherits (root layout). A page that sets its own
 * `openGraph` replaces the whole object, so it spreads this one to keep the image (landing).
 * `public/og-image.png` is rendered from `docs/design/og-image.svg`.
 */
export const SITE_OPEN_GRAPH = {
  type: 'website',
  locale: 'fi_FI',
  siteName: fi.brand.name,
  images: [
    {
      url: '/og-image.png',
      width: 1200,
      height: 630,
      alt: fi.landing.meta.title,
      type: 'image/png',
    },
  ],
} satisfies NonNullable<Metadata['openGraph']>

export function organizationJsonLd(baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: fi.brand.name,
    url: absoluteUrl(baseUrl, '/'),
    description: fi.landing.meta.description,
  }
}

export function faqPageJsonLd(entries: readonly FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'fi',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

/**
 * JSON for a `<script type="application/ld+json">` body. `<` is escaped so no string in the
 * data can close the script element (Next.js JSON-LD guide).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
