import type { MetadataRoute } from 'next'

import { env } from '@/lib/env'
import { robotsConfig } from '@/lib/seo'

/** `/robots.txt`: keeps the admin, the API and the signed-in pages out (MV-100, `lib/seo.ts`). */
export default function robots(): MetadataRoute.Robots {
  return robotsConfig(env.NEXT_PUBLIC_SERVER_URL)
}
