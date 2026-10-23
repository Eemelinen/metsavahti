import pRetry, { AbortError } from 'p-retry'

import { type Bbox, formatBbox } from '@/lib/geo/buffer'
import { type DeclarationFeatureCollection } from '@/lib/wfs/schemas'
import { parseFeatureCollection } from '@/lib/wfs/parse'

export type WfsClientOptions = {
  /** e.g. https://avoin.metsakeskus.fi/rajapinnat/v1/ows/ */
  baseUrl: string
  /** e.g. v1:forestusedeclaration */
  layer: string
  /** Per-request timeout in ms. */
  timeoutMs?: number
  /** Retries on network / 5xx errors. */
  retries?: number
  fetchImpl?: typeof fetch
}

export type GetFeatureParams = {
  /** EPSG:3067 bbox [minE, minN, maxE, maxN] */
  bbox: Bbox
  count?: number
  startIndex?: number
}

export class WfsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'WfsError'
  }
}

export function buildGetFeatureUrl(
  { baseUrl, layer }: Pick<WfsClientOptions, 'baseUrl' | 'layer'>,
  { bbox, count, startIndex }: GetFeatureParams,
): URL {
  const url = new URL(baseUrl)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('typeNames', layer)
  url.searchParams.set('outputFormat', 'application/json')
  url.searchParams.set('srsName', 'EPSG:3067')
  url.searchParams.set('bbox', `${formatBbox(bbox)},EPSG:3067`)
  if (count !== undefined) url.searchParams.set('count', String(count))
  if (startIndex !== undefined) url.searchParams.set('startIndex', String(startIndex))
  return url
}

export function buildGetCapabilitiesUrl({ baseUrl }: Pick<WfsClientOptions, 'baseUrl'>): URL {
  const url = new URL(baseUrl)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', 'GetCapabilities')
  return url
}

export function createWfsClient(options: WfsClientOptions) {
  const timeoutMs = options.timeoutMs ?? 30_000
  const retries = options.retries ?? 3
  const fetchImpl = options.fetchImpl ?? fetch

  async function getJson(url: URL): Promise<unknown> {
    return pRetry(
      async () => {
        const res = await fetchImpl(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (res.status >= 500) throw new WfsError(`WFS responded ${res.status}`, res.status)
        if (!res.ok) {
          // 4xx is not retryable — surface it immediately.
          throw new AbortError(new WfsError(`WFS responded ${res.status}`, res.status))
        }
        return (await res.json()) as unknown
      },
      { retries, minTimeout: 500, factor: 2 },
    )
  }

  return {
    /** Fetch declarations intersecting a bbox (EPSG:3067). */
    async getDeclarations(params: GetFeatureParams): Promise<DeclarationFeatureCollection> {
      const url = buildGetFeatureUrl(options, params)
      return parseFeatureCollection(await getJson(url))
    },
    /** Raw GetCapabilities XML (used by the live contract test). */
    async getCapabilitiesXml(): Promise<string> {
      const res = await fetchImpl(buildGetCapabilitiesUrl(options), {
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new WfsError(`WFS responded ${res.status}`, res.status)
      return res.text()
    },
  }
}

export type WfsClient = ReturnType<typeof createWfsClient>
