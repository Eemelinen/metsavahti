import { readFile } from 'node:fs/promises'
import path from 'node:path'

import maplibrePackage from 'maplibre-gl/package.json'

import { MAPLIBRE_WORKER_FILES } from '@/lib/maplibre-worker'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return MAPLIBRE_WORKER_FILES.map((file) => ({ version: maplibrePackage.version, file }))
}

/**
 * maplibre-gl's module worker from the installed package, read at build time (`lib/maplibre-worker.ts`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await params
  const known = (MAPLIBRE_WORKER_FILES as readonly string[]).includes(file)
  if (version !== maplibrePackage.version || !known) {
    return new Response('Not found', { status: 404 })
  }
  const body = await readFile(path.join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist', file))
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
