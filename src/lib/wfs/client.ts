import pRetry, { AbortError } from 'p-retry'

import { wfs as wfsConfig } from '@/config/wfs'
import { ExternalServiceError } from '@/lib/errors'
import { type Bbox, formatBbox } from '@/lib/geo/buffer'
import { gmlToFeatureCollection, refusesOutputFormat } from '@/lib/wfs/gml'
import { GEOMETRY_FIELD, LAYER_COUNT_DEFAULT, VALID_NOW_FIELD } from '@/lib/wfs/layer'
import { type DeclarationFeatureCollection } from '@/lib/wfs/schemas'
import { parseFeatureCollection } from '@/lib/wfs/parse'

export type WfsClientOptions = {
  /** e.g. https://avoin.metsakeskus.fi/rajapinnat/v1/ows/ */
  baseUrl: string
  /** e.g. v1:forestusedeclaration */
  layer: string
  /** Per-request timeout in ms, body included. */
  timeoutMs?: number
  /** Retries on network errors, timeouts, 429 and 5xx (exponential backoff). */
  retries?: number
  /** Delay before the first retry in ms; doubles on each further one. */
  retryDelayMs?: number
  fetchImpl?: typeof fetch
}

export type FeaturePageOptions = {
  /** Features per page (`count`), at most the server's `CountDefault`. */
  pageSize?: number
  /** Index of the first feature (`startIndex`). */
  startIndex?: number
}

/** `outputFormat` values: GeoJSON first, GML 3.2 (WFS 2.0's default) when JSON is refused. */
export const OUTPUT_FORMATS = {
  json: 'application/json',
  gml: 'application/gml+xml; version=3.2',
} as const

export type OutputFormat = keyof typeof OUTPUT_FORMATS

export type GetFeatureParams = {
  /** EPSG:3067 bbox [minE, minN, maxE, maxN] */
  bbox: Bbox
  count?: number
  startIndex?: number
  outputFormat?: OutputFormat
}

/**
 * The upstream WFS as the pipeline sees it (`01 §4`). The layer is being renewed by
 * Metsäkeskus; a new layer version is a new implementation of this interface.
 */
export interface WfsClient {
  /**
   * Pages of the declarations in force that intersect `bbox3067`, from `startIndex` on,
   * until a page comes back shorter than `pageSize`. Stop iterating to stop fetching.
   * Throws `ExternalServiceError` when a page cannot be fetched or does not match the
   * pinned contract.
   */
  getFeaturesByBbox(
    bbox3067: Bbox,
    options?: FeaturePageOptions,
  ): AsyncGenerator<DeclarationFeatureCollection, void, undefined>
  /** One page of `getFeaturesByBbox()`. */
  getFeaturePage(
    bbox3067: Bbox,
    options?: FeaturePageOptions,
  ): Promise<DeclarationFeatureCollection>
  /** Raw GetCapabilities XML (`pnpm wfs:describe`, the live contract test). */
  getCapabilitiesXml(): Promise<string>
  /** Raw DescribeFeatureType XSD of the layer (`pnpm wfs:describe`, the live contract test). */
  describeFeatureTypeXml(): Promise<string>
}

/**
 * GeoServer CQL filter for the declarations in force that intersect `bbox` (EPSG:3067).
 * The layer keeps expired declarations too, and WFS 2.0 does not combine the `bbox`
 * parameter with a filter, so both go here (D-032).
 */
export function inForceBboxFilter(bbox: Bbox): string {
  return `BBOX(${GEOMETRY_FIELD},${formatBbox(bbox)},'EPSG:3067') AND ${VALID_NOW_FIELD}=1`
}

function baseRequestUrl(baseUrl: string, request: string): URL {
  const url = new URL(baseUrl)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('version', '2.0.0')
  url.searchParams.set('request', request)
  return url
}

export function buildGetFeatureUrl(
  { baseUrl, layer }: Pick<WfsClientOptions, 'baseUrl' | 'layer'>,
  { bbox, count, startIndex, outputFormat = 'json' }: GetFeatureParams,
): URL {
  const url = baseRequestUrl(baseUrl, 'GetFeature')
  url.searchParams.set('typeNames', layer)
  url.searchParams.set('outputFormat', OUTPUT_FORMATS[outputFormat])
  url.searchParams.set('srsName', 'EPSG:3067')
  url.searchParams.set('CQL_FILTER', inForceBboxFilter(bbox))
  if (count !== undefined) url.searchParams.set('count', String(count))
  if (startIndex !== undefined) url.searchParams.set('startIndex', String(startIndex))
  return url
}

export function buildGetCapabilitiesUrl({ baseUrl }: Pick<WfsClientOptions, 'baseUrl'>): URL {
  return baseRequestUrl(baseUrl, 'GetCapabilities')
}

export function buildDescribeFeatureTypeUrl({
  baseUrl,
  layer,
}: Pick<WfsClientOptions, 'baseUrl' | 'layer'>): URL {
  const url = baseRequestUrl(baseUrl, 'DescribeFeatureType')
  url.searchParams.set('typeNames', layer)
  return url
}

/** An HTTP answer other than 2xx; the cause of the `ExternalServiceError`. */
class WfsHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`WFS responded ${status}`)
    this.name = 'WfsHttpError'
  }
}

/** The JSON request was answered with an OWS exception about `outputFormat`. */
const JSON_REFUSED = Symbol('json refused')

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' ? 'timed out' : error.message
  }
  return String(error)
}

function pageOptions({ pageSize = wfsConfig.pageSize, startIndex = 0 }: FeaturePageOptions) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`)
  }
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    throw new RangeError(`startIndex must be a non-negative integer, got ${startIndex}`)
  }
  // The server never returns more than CountDefault; a larger page would look like the last.
  return { pageSize: Math.min(pageSize, LAYER_COUNT_DEFAULT), startIndex }
}

/** `WfsClient` for the Metsäkeskus GeoServer (`v1:forestusedeclaration`, `layer.ts`). */
export class MetsakeskusWfsClient implements WfsClient {
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly retryDelayMs: number
  private readonly fetchImpl: typeof fetch
  /** Switches to `gml` the first time the service refuses JSON, for the client's lifetime. */
  private format: OutputFormat = 'json'

  constructor(private readonly options: WfsClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.retries = options.retries ?? 3
    this.retryDelayMs = options.retryDelayMs ?? 500
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  /** Output format the next `GetFeature` asks for. */
  get outputFormat(): OutputFormat {
    return this.format
  }

  async *getFeaturesByBbox(
    bbox3067: Bbox,
    options: FeaturePageOptions = {},
  ): AsyncGenerator<DeclarationFeatureCollection, void, undefined> {
    const { pageSize, startIndex } = pageOptions(options)
    let index = startIndex
    for (;;) {
      const page = await this.getFeaturePage(bbox3067, { pageSize, startIndex: index })
      yield page
      if (page.features.length < pageSize) return
      index += page.features.length
    }
  }

  async getFeaturePage(
    bbox3067: Bbox,
    options: FeaturePageOptions = {},
  ): Promise<DeclarationFeatureCollection> {
    const { pageSize, startIndex } = pageOptions(options)
    const params = { bbox: bbox3067, count: pageSize, startIndex }
    let raw: unknown = JSON_REFUSED
    if (this.format === 'json') {
      raw = await this.send('GetFeature', buildGetFeatureUrl(this.options, params), 'json')
      if (raw === JSON_REFUSED) this.format = 'gml'
    }
    if (raw === JSON_REFUSED) {
      raw = await this.send(
        'GetFeature',
        buildGetFeatureUrl(this.options, { ...params, outputFormat: 'gml' }),
        'gml',
      )
    }
    try {
      return parseFeatureCollection(raw)
    } catch (error) {
      throw new ExternalServiceError(
        'wfs',
        `WFS GetFeature (startIndex ${startIndex}) does not match the pinned layer contract`,
        { cause: error },
      )
    }
  }

  async getCapabilitiesXml(): Promise<string> {
    return this.send('GetCapabilities', buildGetCapabilitiesUrl(this.options), 'text')
  }

  async describeFeatureTypeXml(): Promise<string> {
    return this.send('DescribeFeatureType', buildDescribeFeatureTypeUrl(this.options), 'text')
  }

  /**
   * One request with the per-attempt timeout and `p-retry`: network errors, timeouts,
   * 429 and 5xx are retried, other 4xx and unreadable bodies are not. Every failure
   * leaves as `ExternalServiceError('wfs')` with the last error as its cause.
   */
  private async send(request: string, url: URL, read: 'text'): Promise<string>
  private async send(request: string, url: URL, read: OutputFormat): Promise<unknown>
  private async send(request: string, url: URL, read: OutputFormat | 'text'): Promise<unknown> {
    const accept =
      read === 'json'
        ? 'application/json'
        : read === 'gml'
          ? 'application/gml+xml, application/xml, text/xml'
          : 'application/xml, text/xml'
    try {
      return await pRetry(
        async () => {
          const res = await this.fetchImpl(url, {
            headers: { accept },
            signal: AbortSignal.timeout(this.timeoutMs),
          })
          const body = await res.text()
          if (!res.ok) {
            if (read === 'json' && res.status < 500 && refusesOutputFormat(body)) {
              return JSON_REFUSED
            }
            const error = new WfsHttpError(res.status, body.slice(0, 500))
            throw isRetryableStatus(res.status) ? error : new AbortError(error)
          }
          if (read === 'text') return body
          return this.readFeatures(body, read)
        },
        { retries: this.retries, minTimeout: this.retryDelayMs, factor: 2 },
      )
    } catch (error) {
      throw new ExternalServiceError('wfs', `WFS ${request} failed: ${describeError(error)}`, {
        cause: error,
      })
    }
  }

  /** A 2xx `GetFeature` body. GeoServer may answer XML even to a JSON request. */
  private readFeatures(body: string, format: OutputFormat): unknown {
    const xml = body.trimStart().startsWith('<')
    try {
      if (!xml) {
        if (format === 'gml') throw new Error('expected GML, got a non-XML body')
        return JSON.parse(body) as unknown
      }
      if (format === 'json' && refusesOutputFormat(body)) return JSON_REFUSED
      return gmlToFeatureCollection(body)
    } catch (error) {
      // A body that does not parse is not going to parse on the next attempt either.
      throw new AbortError(error instanceof Error ? error : new Error(String(error)))
    }
  }
}
