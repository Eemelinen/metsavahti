import { describe, expect, it } from 'vitest'

import { MetsakeskusWfsClient } from '@/lib/wfs/client'
import { attributeDrift, findLayer, parseDescribeFeatureType } from '@/lib/wfs/describe'
import { LAYER_DEFAULT_CRS, LAYER_NAME, VALID_NOW_FIELD } from '@/lib/wfs/layer'

/**
 * Contract test against the real Metsäkeskus WFS. Opt-in (`pnpm test:live`),
 * runs nightly in CI, and fails when the data model drifts from the contract pinned in
 * `src/lib/wfs/layer.ts` (re-run `pnpm wfs:describe` to see how).
 */
const baseUrl = process.env.WFS_BASE_URL ?? 'https://avoin.metsakeskus.fi/rajapinnat/v1/ows/'
const layer = process.env.WFS_LAYER ?? LAYER_NAME

describe('Metsäkeskus WFS contract', () => {
  const client = new MetsakeskusWfsClient({ baseUrl, layer, timeoutMs: 60_000 })

  it('GetCapabilities advertises the layer, JSON output and EPSG:3067', async () => {
    const xml = await client.getCapabilitiesXml()
    expect(findLayer(xml, layer)?.defaultCrs).toBe(LAYER_DEFAULT_CRS)
    expect(xml).toContain('application/json')
  })

  it('DescribeFeatureType still has the pinned attributes and types', async () => {
    const described = parseDescribeFeatureType(await client.describeFeatureTypeXml())
    expect(attributeDrift(described)).toEqual({ added: [], removed: [], retyped: [] })
  })

  it('GetFeature with a bbox returns stands in force matching the schema', async () => {
    // ~20 km box north-east of Helsinki
    const fc = await client.getFeaturePage([380_000, 6_670_000, 400_000, 6_690_000], {
      pageSize: 5,
    })
    expect(fc.features.length).toBeGreaterThan(0)
    expect(fc.crs?.properties.name).toBe('urn:ogc:def:crs:EPSG::3067')
    for (const feature of fc.features) expect(feature.properties[VALID_NOW_FIELD]).toBe(1)
  })
})
