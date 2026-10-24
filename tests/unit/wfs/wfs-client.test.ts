import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { ExternalServiceError } from '@/lib/errors'
import {
  MetsakeskusWfsClient,
  type WfsClient,
  buildDescribeFeatureTypeUrl,
  buildGetFeatureUrl,
} from '@/lib/wfs/client'
import { gmlToFeatureCollection } from '@/lib/wfs/gml'
import { LAYER_COUNT_DEFAULT } from '@/lib/wfs/layer'
import { normaliseFeatures } from '@/lib/wfs/normalise'
import { parseFeatureCollection } from '@/lib/wfs/parse'
import type { DeclarationFeatureCollection } from '@/lib/wfs/schemas'
import manifest from '../../fixtures/wfs/manifest.json'
import { server } from '../../helpers/msw'
import { loadWfsFixture, requestBbox, toGml } from '../../helpers/wfs-fixture'

const baseUrl = 'https://wfs.test/rajapinnat/v1/ows/'
const layer = 'v1:forestusedeclaration'
const bbox: [number, number, number, number] = [399_000, 6_688_000, 401_000, 6_690_000]

/** Fast retries for the tests; the production default is 500 ms, doubling. */
function client(options: Partial<ConstructorParameters<typeof MetsakeskusWfsClient>[0]> = {}) {
  return new MetsakeskusWfsClient({ baseUrl, layer, retryDelayMs: 1, ...options })
}

async function collect(pages: ReturnType<WfsClient['getFeaturesByBbox']>) {
  const result: DeclarationFeatureCollection[] = []
  for await (const page of pages) result.push(page)
  return result
}

const ids = (fc: DeclarationFeatureCollection) => fc.features.map((f) => f.id)

/** The recorded set's 19 stands in id order, the way the live layer pages them. */
const pagedFeatures = [
  ...loadWfsFixture('paged-1.json').features,
  ...loadWfsFixture('paged-2.json').features,
]

type SeenRequest = { count: number; startIndex: number; outputFormat: string | null }

/** A GetFeature endpoint that pages `features` with `count` / `startIndex` like GeoServer. */
function pagingHandler(features = pagedFeatures, seen: SeenRequest[] = []) {
  return http.get(baseUrl, ({ request }) => {
    const params = new URL(request.url).searchParams
    const count = Number(params.get('count') ?? LAYER_COUNT_DEFAULT)
    const startIndex = Number(params.get('startIndex') ?? 0)
    seen.push({ count, startIndex, outputFormat: params.get('outputFormat') })
    const page = features.slice(startIndex, startIndex + count)
    return HttpResponse.json({
      type: 'FeatureCollection',
      features: page,
      totalFeatures: 'unknown',
      numberReturned: page.length,
      crs: page.length
        ? { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3067' } }
        : null,
    })
  })
}

const OUTPUT_FORMAT_REFUSED = `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1" version="2.0.0">
  <ows:Exception exceptionCode="InvalidParameterValue" locator="outputFormat">
    <ows:ExceptionText>Failed to find response for output format application/json</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`

describe('wfs client URLs', () => {
  it('builds a WFS 2.0.0 GetFeature URL in EPSG:3067 with JSON output', () => {
    const url = buildGetFeatureUrl({ baseUrl, layer }, { bbox, count: 100 })
    expect(url.origin + url.pathname).toBe('https://wfs.test/rajapinnat/v1/ows/')
    expect(url.searchParams.get('service')).toBe('WFS')
    expect(url.searchParams.get('version')).toBe('2.0.0')
    expect(url.searchParams.get('request')).toBe('GetFeature')
    expect(url.searchParams.get('typeNames')).toBe(layer)
    expect(url.searchParams.get('outputFormat')).toBe('application/json')
    expect(url.searchParams.get('srsName')).toBe('EPSG:3067')
    expect(url.searchParams.get('count')).toBe('100')
  })

  it('asks for the stands in force inside the bbox through CQL_FILTER, not the bbox parameter', () => {
    const url = buildGetFeatureUrl({ baseUrl, layer }, { bbox, count: 100, startIndex: 200 })
    expect(url.searchParams.get('CQL_FILTER')).toBe(
      "BBOX(GEOMETRY,399000.00,6688000.00,401000.00,6690000.00,'EPSG:3067') AND VALID_NOW=1",
    )
    expect(url.searchParams.has('bbox')).toBe(false)
    expect(url.searchParams.get('startIndex')).toBe('200')
    expect(requestBbox(url.searchParams)).toEqual(bbox)
  })

  it('asks for GML 3.2 on the fallback path', () => {
    const url = buildGetFeatureUrl({ baseUrl, layer }, { bbox, outputFormat: 'gml' })
    expect(url.searchParams.get('outputFormat')).toBe('application/gml+xml; version=3.2')
  })

  it('builds a DescribeFeatureType URL for the layer', () => {
    const url = buildDescribeFeatureTypeUrl({ baseUrl, layer })
    expect(url.searchParams.get('request')).toBe('DescribeFeatureType')
    expect(url.searchParams.get('typeNames')).toBe(layer)
  })
})

describe('wfs client paging', () => {
  it('iterates the recorded pages with count / startIndex until a short page', async () => {
    const seen: SeenRequest[] = []
    server.use(pagingHandler(pagedFeatures, seen))
    const pages = await collect(client().getFeaturesByBbox(bbox, { pageSize: 10 }))
    expect(pages.map(ids)).toEqual([
      manifest.fixtures['paged-1'].ids,
      manifest.fixtures['paged-2'].ids,
    ])
    expect(seen).toEqual([
      { count: 10, startIndex: 0, outputFormat: 'application/json' },
      { count: 10, startIndex: 10, outputFormat: 'application/json' },
    ])
  })

  it('asks once more after a full last page and ends on the empty one', async () => {
    const seen: SeenRequest[] = []
    server.use(pagingHandler(pagedFeatures, seen))
    const pages = await collect(client().getFeaturesByBbox(bbox, { pageSize: 19 }))
    expect(pages.map((page) => page.features.length)).toEqual([19, 0])
    expect(seen.map((r) => r.startIndex)).toEqual([0, 19])
  })

  it('starts at startIndex', async () => {
    server.use(pagingHandler())
    const pages = await collect(client().getFeaturesByBbox(bbox, { pageSize: 10, startIndex: 10 }))
    expect(pages.map(ids)).toEqual([manifest.fixtures['paged-2'].ids])
  })

  it('yields one empty page for an empty box', async () => {
    server.use(http.get(baseUrl, () => HttpResponse.json(loadWfsFixture('empty.json'))))
    const pages = await collect(client().getFeaturesByBbox(bbox))
    expect(pages).toHaveLength(1)
    expect(pages[0]!.features).toEqual([])
  })

  it('fetches no further page once the caller stops iterating', async () => {
    const seen: SeenRequest[] = []
    server.use(pagingHandler(pagedFeatures, seen))
    for await (const page of client().getFeaturesByBbox(bbox, { pageSize: 5 })) {
      expect(page.features).toHaveLength(5)
      break
    }
    expect(seen).toHaveLength(1)
  })

  it('defaults to pages of 1 000 and never asks for more than CountDefault', async () => {
    const seen: SeenRequest[] = []
    server.use(pagingHandler(pagedFeatures, seen))
    await collect(client().getFeaturesByBbox(bbox))
    await collect(client().getFeaturesByBbox(bbox, { pageSize: 50_000 }))
    expect(seen.map((r) => r.count)).toEqual([1_000, LAYER_COUNT_DEFAULT])
  })

  it('rejects a page size that is not a positive integer', async () => {
    await expect(client().getFeaturePage(bbox, { pageSize: 0 })).rejects.toBeInstanceOf(RangeError)
  })
})

describe('wfs client failures', () => {
  it('retries a 502 and then succeeds', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return calls < 3
          ? new HttpResponse('bad gateway', { status: 502 })
          : HttpResponse.json(loadWfsFixture('inside.json'))
      }),
    )
    const page = await client().getFeaturePage(bbox)
    expect(calls).toBe(3)
    expect(ids(page)).toEqual(manifest.fixtures.inside.ids)
  })

  it('gives up after three retries with an ExternalServiceError', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return new HttpResponse('bad gateway', { status: 502 })
      }),
    )
    const error = await client()
      .getFeaturePage(bbox)
      .catch((e: unknown) => e)
    expect(calls).toBe(4)
    expect(error).toBeInstanceOf(ExternalServiceError)
    expect(error).toMatchObject({ service: 'wfs', status: 502, code: 'external_service' })
    expect((error as Error).message).toBe('WFS GetFeature failed: WFS responded 502')
    expect((error as Error).cause).toMatchObject({ status: 502, body: 'bad gateway' })
  })

  it('does not retry a 400', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return new HttpResponse('bad request', { status: 400 })
      }),
    )
    await expect(client().getFeaturePage(bbox)).rejects.toThrow(
      new ExternalServiceError('wfs', 'WFS GetFeature failed: WFS responded 400'),
    )
    expect(calls).toBe(1)
  })

  it('times out a slow answer, retries it and then fails', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, async () => {
        calls += 1
        await delay(1_000)
        return HttpResponse.json(loadWfsFixture('inside.json'))
      }),
    )
    const error = await client({ timeoutMs: 50, retries: 1 })
      .getFeaturePage(bbox)
      .catch((e: unknown) => e)
    expect(calls).toBe(2)
    expect(error).toBeInstanceOf(ExternalServiceError)
    expect((error as Error).message).toBe('WFS GetFeature failed: timed out')
  })

  it('recovers when only the first attempt times out', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, async () => {
        calls += 1
        if (calls === 1) await delay(1_000)
        return HttpResponse.json(loadWfsFixture('inside.json'))
      }),
    )
    const page = await client({ timeoutMs: 50 }).getFeaturePage(bbox)
    expect(calls).toBe(2)
    expect(ids(page)).toEqual(manifest.fixtures.inside.ids)
  })

  it('reports contract drift as an ExternalServiceError without retrying', async () => {
    let calls = 0
    const fc = loadWfsFixture('inside.json')
    const { FORESTUSEDECLARATIONNUMBER: _dropped, ...properties } = fc.features[0]!.properties
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return HttpResponse.json({ ...fc, features: [{ ...fc.features[0], properties }] })
      }),
    )
    const error = await client()
      .getFeaturePage(bbox)
      .catch((e: unknown) => e)
    expect(calls).toBe(1)
    expect(error).toBeInstanceOf(ExternalServiceError)
    expect((error as Error).message).toMatch(/does not match the pinned layer contract/)
    expect((error as Error).cause).toBeInstanceOf(ZodError)
  })

  it('does not retry a body that is not JSON', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return new HttpResponse('{"type": "FeatureCollection", "featu', {
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    await expect(client().getFeaturePage(bbox)).rejects.toBeInstanceOf(ExternalServiceError)
    expect(calls).toBe(1)
  })

  it('wraps GetCapabilities failures too', async () => {
    server.use(http.get(baseUrl, () => new HttpResponse(null, { status: 503 })))
    await expect(client({ retries: 0 }).getCapabilitiesXml()).rejects.toThrow(
      'WFS GetCapabilities failed: WFS responded 503',
    )
  })
})

describe('wfs client GML fallback', () => {
  it('turns the recorded GeoJSON pages, encoded as GML, back into the same records', () => {
    for (const name of ['inside.json', 'borderline.json', 'outside.json', 'paged-1.json']) {
      const json = parseFeatureCollection(loadWfsFixture(name))
      const gml = parseFeatureCollection(gmlToFeatureCollection(toGml(json)))
      expect(gml.features).toEqual(json.features)
      // Same attrHash / geomHash, so switching formats does not look like changed declarations.
      expect(normaliseFeatures(gml)).toEqual(normaliseFeatures(json))
      expect(gml.crs?.properties.name).toBe('urn:ogc:def:crs:EPSG::3067')
    }
  })

  it('switches to GML when the service refuses JSON, and stays on it', async () => {
    const seen: string[] = []
    const fixture = loadWfsFixture('inside.json')
    server.use(
      http.get(baseUrl, ({ request }) => {
        const format = new URL(request.url).searchParams.get('outputFormat') ?? ''
        seen.push(format)
        if (format === 'application/json') {
          return new HttpResponse(OUTPUT_FORMAT_REFUSED, {
            status: 400,
            headers: { 'content-type': 'application/xml' },
          })
        }
        return new HttpResponse(toGml(fixture), {
          headers: { 'content-type': 'application/gml+xml; version=3.2' },
        })
      }),
    )
    const wfs = client()
    const first = await wfs.getFeaturePage(bbox)
    expect(wfs.outputFormat).toBe('gml')
    const second = await wfs.getFeaturePage(bbox)
    expect(seen).toEqual([
      'application/json',
      'application/gml+xml; version=3.2',
      'application/gml+xml; version=3.2',
    ])
    expect(first.features).toEqual(parseFeatureCollection(fixture).features)
    expect(second.features).toEqual(first.features)
  })

  it('reads GML that comes back to a JSON request', async () => {
    const fixture = loadWfsFixture('inside.json')
    server.use(
      http.get(
        baseUrl,
        () => new HttpResponse(toGml(fixture), { headers: { 'content-type': 'text/xml' } }),
      ),
    )
    const wfs = client()
    const page = await wfs.getFeaturePage(bbox)
    expect(ids(page)).toEqual(manifest.fixtures.inside.ids)
    expect(wfs.outputFormat).toBe('json')
  })

  it('pages over GML like over JSON', async () => {
    const seen: SeenRequest[] = []
    server.use(
      http.get(baseUrl, ({ request }) => {
        const params = new URL(request.url).searchParams
        const count = Number(params.get('count'))
        const startIndex = Number(params.get('startIndex'))
        const outputFormat = params.get('outputFormat')
        seen.push({ count, startIndex, outputFormat })
        if (outputFormat === 'application/json') {
          return new HttpResponse(OUTPUT_FORMAT_REFUSED, { status: 400 })
        }
        const features = pagedFeatures.slice(startIndex, startIndex + count)
        return new HttpResponse(toGml({ type: 'FeatureCollection', features }))
      }),
    )
    const pages = await collect(client().getFeaturesByBbox(bbox, { pageSize: 10 }))
    expect(pages.map(ids)).toEqual([
      manifest.fixtures['paged-1'].ids,
      manifest.fixtures['paged-2'].ids,
    ])
    expect(seen.map((r) => [r.startIndex, r.outputFormat])).toEqual([
      [0, 'application/json'],
      [0, 'application/gml+xml; version=3.2'],
      [10, 'application/gml+xml; version=3.2'],
    ])
  })

  it('reads MultiSurface, interior rings, nil and missing attributes', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"
  xmlns:v1="https://avoin.metsakeskus.fi/rajapinnat/v1"
  numberMatched="1" numberReturned="1" timeStamp="2026-10-24T08:59:00.439Z">
  <wfs:member>
    <v1:forestusedeclaration gml:id="forestusedeclaration.1">
      <v1:GEOMETRY>
        <gml:MultiSurface gml:id="forestusedeclaration.1.GEOMETRY" srsName="urn:ogc:def:crs:EPSG::3067" srsDimension="2">
          <gml:surfaceMember>
            <gml:Polygon gml:id="forestusedeclaration.1.GEOMETRY.1">
              <gml:exterior><gml:LinearRing><gml:posList>0 0 100 0 100 100 0 100 0 0</gml:posList></gml:LinearRing></gml:exterior>
              <gml:interior><gml:LinearRing><gml:posList>10 10 20 10 20 20 10 10</gml:posList></gml:LinearRing></gml:interior>
            </gml:Polygon>
          </gml:surfaceMember>
          <gml:surfaceMember>
            <gml:Polygon gml:id="forestusedeclaration.1.GEOMETRY.2">
              <gml:exterior><gml:LinearRing>
                <gml:pos>200 0</gml:pos><gml:pos>300 0</gml:pos><gml:pos>300 100</gml:pos><gml:pos>200 0</gml:pos>
              </gml:LinearRing></gml:exterior>
            </gml:Polygon>
          </gml:surfaceMember>
        </gml:MultiSurface>
      </v1:GEOMETRY>
      <v1:FORESTUSEDECLARATIONNUMBER>1-2026-000001</v1:FORESTUSEDECLARATIONNUMBER>
      <v1:DECLARATIONSTATE>40</v1:DECLARATIONSTATE>
      <v1:VALID_NOW>1</v1:VALID_NOW>
      <v1:AREA>2.5</v1:AREA>
      <v1:CUTTINGREALIZATIONPRACTICE xsi:nil="true"/>
      <v1:UPDATETIME>2026-06-05T11:39:34+03:00</v1:UPDATETIME>
      <v1:NEWCOLUMN>kept as text</v1:NEWCOLUMN>
    </v1:forestusedeclaration>
  </wfs:member>
</wfs:FeatureCollection>`
    const fc = parseFeatureCollection(gmlToFeatureCollection(xml))
    expect(fc).toMatchObject({ numberReturned: 1, totalFeatures: 1 })
    const [feature] = fc.features
    expect(feature!.id).toBe('forestusedeclaration.1')
    expect(feature!.geometry).toEqual({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
            [0, 0],
          ],
          [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 10],
          ],
        ],
        [
          [
            [200, 0],
            [300, 0],
            [300, 100],
            [200, 0],
          ],
        ],
      ],
    })
    expect(feature!.properties).toMatchObject({
      FORESTUSEDECLARATIONNUMBER: '1-2026-000001',
      DECLARATIONSTATE: '40',
      VALID_NOW: 1,
      AREA: 2.5,
      CUTTINGREALIZATIONPRACTICE: null,
      DECLARATIONARRIVALDATE: null,
      UPDATETIME: '2026-06-05T11:39:34+03:00',
      NEWCOLUMN: 'kept as text',
    })
  })

  it('fails without retrying on an OWS exception that is not about the output format', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return new HttpResponse(
          `<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1"><ows:Exception exceptionCode="NoApplicableCode"><ows:ExceptionText>Could not parse CQL filter</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`,
          { headers: { 'content-type': 'application/xml' } },
        )
      }),
    )
    await expect(client().getFeaturePage(bbox)).rejects.toThrow(
      'WFS GetFeature failed: WFS exception: NoApplicableCode: Could not parse CQL filter',
    )
    expect(calls).toBe(1)
  })
})
