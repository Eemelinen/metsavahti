/**
 * Deterministic stand-in for the Metsäkeskus WFS used by the E2E suite.
 * Serves the recorded fixture for GetFeature requests whose bbox intersects it,
 * an empty collection otherwise, and a minimal GetCapabilities document.
 *
 *   WFS_BASE_URL=http://localhost:3200/ows/   (see .env.test)
 */
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import { loadWfsFixture, parseBboxParam, wfsResponseForBbox } from '../../helpers/wfs-fixture'

const port = Number(process.env.WFS_MOCK_PORT ?? 3200)
const fixture = loadWfsFixture()
const app = new Hono()

app.get('/health', (c) => c.json({ ok: true, features: fixture.features.length }))

app.get('/ows/', (c) => {
  const request = (c.req.query('request') ?? '').toLowerCase()
  if (request === 'getcapabilities') {
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_Capabilities version="2.0.0" xmlns:wfs="http://www.opengis.net/wfs/2.0">
  <FeatureTypeList><FeatureType><Name>v1:forestusedeclaration</Name>
  <DefaultCRS>urn:ogc:def:crs:EPSG::3067</DefaultCRS></FeatureType></FeatureTypeList>
</wfs:WFS_Capabilities>`,
      200,
      { 'content-type': 'application/xml' },
    )
  }
  if (request === 'getfeature') {
    const bbox = parseBboxParam(c.req.query('bbox') ?? null)
    return c.json(wfsResponseForBbox(fixture, bbox))
  }
  return c.json({ error: `unsupported request "${request}"` }, 400)
})

serve({ fetch: app.fetch, port }, () => {
  console.log(
    `[wfs-mock] listening on http://localhost:${port}/ows/ (${fixture.features.length} features)`,
  )
})
