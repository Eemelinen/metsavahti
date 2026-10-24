import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // E2E runs the app from a separate build directory (see .env.test) so it can
  // run next to a normal `pnpm dev` — Next 16 holds a lock per distDir.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Turbopack is the default bundler in Next 16 for both dev and build.
  turbopack: {
    root: path.resolve(dirname),
  },
  // Native (napi) renderer of the alert map image; it must be required at runtime, not bundled.
  serverExternalPackages: ['@resvg/resvg-js'],
  // The watch-area list was `/dashboard` until MV-066 (00-deviations R3); keep old links working.
  async redirects() {
    return [{ source: '/dashboard', destination: '/vahtialueet', permanent: true }]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
