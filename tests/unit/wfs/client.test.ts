import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import {
  WfsError,
  buildDescribeFeatureTypeUrl,
  buildGetFeatureUrl,
  createWfsClient,
} from '@/lib/wfs/client'
import { server } from '../../helpers/msw'
import { loadWfsFixture, requestBbox } from '../../helpers/wfs-fixture'

const baseUrl = 'https://wfs.test/rajapinnat/v1/ows/'
const layer = 'v1:forestusedeclaration'
const bbox: [number, number, number, number] = [399_000, 6_688_000, 401_000, 6_690_000]

describe('wfs client', () => {
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

  it('builds a DescribeFeatureType URL for the layer', () => {
    const url = buildDescribeFeatureTypeUrl({ baseUrl, layer })
    expect(url.searchParams.get('request')).toBe('DescribeFeatureType')
    expect(url.searchParams.get('typeNames')).toBe(layer)
  })

  it('fetches and validates declarations', async () => {
    server.use(http.get(baseUrl, () => HttpResponse.json(loadWfsFixture())))
    const client = createWfsClient({ baseUrl, layer })
    const fc = await client.getDeclarations({ bbox })
    expect(fc.features).toHaveLength(2)
  })

  it('retries on 5xx and then succeeds', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return calls < 3
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json(loadWfsFixture())
      }),
    )
    const client = createWfsClient({ baseUrl, layer, retries: 3 })
    const fc = await client.getDeclarations({ bbox })
    expect(calls).toBe(3)
    expect(fc.features).toHaveLength(2)
  })

  it('does not retry on 4xx', async () => {
    let calls = 0
    server.use(
      http.get(baseUrl, () => {
        calls += 1
        return new HttpResponse('bad request', { status: 400 })
      }),
    )
    const client = createWfsClient({ baseUrl, layer, retries: 3 })
    await expect(client.getDeclarations({ bbox })).rejects.toBeInstanceOf(WfsError)
    expect(calls).toBe(1)
  })
})
