import { describe, expect, it } from 'vitest'

import { createWfsClient } from '@/lib/wfs/client'

/**
 * Contract test against the real Metsäkeskus WFS. Opt-in (`pnpm test:live`),
 * runs nightly in CI, and fails when the data model drifts from our Zod schema.
 */
const baseUrl = process.env.WFS_BASE_URL ?? 'https://avoin.metsakeskus.fi/rajapinnat/v1/ows/'
const layer = process.env.WFS_LAYER ?? 'v1:forestusedeclaration'

describe('Metsäkeskus WFS contract', () => {
  const client = createWfsClient({ baseUrl, layer, timeoutMs: 60_000 })

  it('GetCapabilities advertises the layer, JSON output and EPSG:3067', async () => {
    const xml = await client.getCapabilitiesXml()
    expect(xml).toContain(`<Name>${layer}</Name>`)
    expect(xml).toContain('application/json')
    expect(xml).toContain('urn:ogc:def:crs:EPSG::3067')
  })

  it('GetFeature with a bbox returns features matching the schema', async () => {
    // ~20 km box north-east of Helsinki
    const fc = await client.getDeclarations({
      bbox: [380_000, 6_670_000, 400_000, 6_690_000],
      count: 5,
    })
    expect(fc.features.length).toBeGreaterThan(0)
    expect(fc.crs?.properties.name).toBe('urn:ogc:def:crs:EPSG::3067')
  })
})
