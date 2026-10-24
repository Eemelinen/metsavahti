import { describe, expect, it } from 'vitest'

import { parseFeatureCollection } from '@/lib/wfs/parse'
import { loadWfsFixture } from '../../helpers/wfs-fixture'

describe('wfs parse', () => {
  const fixture = loadWfsFixture()

  it('validates the recorded WFS response against the schema', () => {
    const fc = parseFeatureCollection(fixture)
    expect(fc.features).toHaveLength(2)
    expect(fc.crs?.properties.name).toBe('urn:ogc:def:crs:EPSG::3067')
  })

  it('rejects responses that drift from the contract', () => {
    const broken = {
      ...fixture,
      features: [{ ...fixture.features[0], geometry: { type: 'Point', coordinates: [1, 2] } }],
    }
    expect(() => parseFeatureCollection(broken)).toThrow()
    expect(() => parseFeatureCollection({ type: 'Nope' })).toThrow()
  })
})
