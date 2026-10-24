import { describe, expect, it } from 'vitest'

import {
  mapSourceOrigins,
  mapSources,
  WMS_MIN_ZOOM,
  WMS_STYLE,
  wmsTileUrl,
} from '@/lib/map-sources'

/** MV-060: what `MapView` loads its rasters from, and the origins the CSP must allow. */
describe('map sources', () => {
  it('reads the base tiles from MAP_TILE_URL and the WMS from the WFS endpoint', () => {
    // `.env.test` points both at the e2e mock server.
    expect(mapSources()).toEqual({
      baseTiles: {
        url: 'http://localhost:3200/tiles/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
      },
      wms: {
        url: expect.stringMatching(/^http:\/\/localhost:3200\/ows\/\?SERVICE=WMS&/),
        minZoom: 12,
      },
    })
    expect(mapSourceOrigins()).toEqual(['http://localhost:3200'])
  })

  it('builds a GetMap template of currently valid declarations in EPSG:3857 tiles', () => {
    const url = wmsTileUrl(
      'https://avoin.metsakeskus.fi/rajapinnat/v1/ows/',
      'v1:forestusedeclaration',
    )
    // MapLibre substitutes the literal placeholder, so it must stay unencoded.
    expect(url.endsWith('&BBOX={bbox-epsg-3857}')).toBe(true)
    const params = new URL(url.replace('{bbox-epsg-3857}', '0,0,1,1')).searchParams
    expect(Object.fromEntries(params)).toEqual({
      SERVICE: 'WMS',
      VERSION: '1.3.0',
      REQUEST: 'GetMap',
      LAYERS: 'v1:forestusedeclaration',
      STYLES: WMS_STYLE,
      FORMAT: 'image/png',
      TRANSPARENT: 'true',
      CRS: 'EPSG:3857',
      WIDTH: '256',
      HEIGHT: '256',
      BBOX: '0,0,1,1',
    })
    expect(wmsTileUrl('https://wms.example.test/ows?map=x', 'l')).toMatch(
      /^https:\/\/wms\.example\.test\/ows\?map=x&SERVICE=WMS&/,
    )
    expect(WMS_MIN_ZOOM).toBe(12)
  })

  it('lists each distinct origin once', () => {
    expect(
      mapSourceOrigins({
        baseTiles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: 'OSM' },
        wms: {
          url: wmsTileUrl('https://avoin.metsakeskus.fi/rajapinnat/v1/ows/', 'l'),
          minZoom: 12,
        },
      }),
    ).toEqual(['https://tile.openstreetmap.org', 'https://avoin.metsakeskus.fi'])
  })
})
