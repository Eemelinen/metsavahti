import type { MetadataRoute } from 'next'

import { env } from '@/lib/env'
import { sitemapEntries } from '@/lib/seo'

/** `/sitemap.xml`: marketing and legal pages only (MV-100, `lib/seo.ts`). */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(env.NEXT_PUBLIC_SERVER_URL)
}
