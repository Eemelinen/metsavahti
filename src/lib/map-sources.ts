import { env } from '@/lib/env'

/**
 * Where the browser map (`MapView`, MV-060) loads its rasters from. Built on the server from
 * `env` and handed to the client component as a prop, so the same values feed the CSP
 * (`mapSourceOrigins()` → `src/proxy.ts`) and the map.
 */
export type MapSources = {
  /** Base map: an XYZ raster template (`MAP_TILE_URL`) and the provider's attribution. */
  baseTiles: { url: string; attribution: string }
  /**
   * Metsäkeskus WMS as 256 px EPSG:3857 tiles: the optional "Metsäkeskuksen karttataso" layer.
   * `minZoom` is a map zoom (`WMS_MIN_ZOOM`).
   */
  wms: { url: string; minZoom: number }
}

/**
 * WMS style of the forest-use declaration layer that draws only declarations in force (the
 * layer keeps history, D-032). Read from `GetCapabilities` of the WFS endpoint, which serves
 * WMS 1.3.0 as well, on 2026-10-24; other styles: "Forest use declaration", "Forest use
 * declaration cutting realization practice".
 */
export const WMS_STYLE = 'Forest use declaration currently valid'

/**
 * Lowest map zoom with WMS content. The layer's `MaxScaleDenominator` is 100 000: GeoServer
 * answers blank tiles above that scale. MapLibre fetches 256 px rasters one zoom level above
 * the map zoom, so map zoom 12 loads tile zoom 13 (19 m / px, 1:68 000), the first level the
 * WMS draws; `MapView` does not request the levels below.
 */
export const WMS_MIN_ZOOM = 12

/** `GetMap` template for MapLibre: `{bbox-epsg-3857}` is filled in per tile. */
export function wmsTileUrl(baseUrl: string, layer: string): string {
  const params = [
    'SERVICE=WMS',
    'VERSION=1.3.0',
    'REQUEST=GetMap',
    `LAYERS=${encodeURIComponent(layer)}`,
    `STYLES=${encodeURIComponent(WMS_STYLE)}`,
    'FORMAT=image/png',
    'TRANSPARENT=true',
    'CRS=EPSG:3857',
    'WIDTH=256',
    'HEIGHT=256',
    'BBOX={bbox-epsg-3857}',
  ]
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.join('&')}`
}

export function mapSources(): MapSources {
  return {
    baseTiles: { url: env.MAP_TILE_URL, attribution: env.MAP_TILE_ATTRIBUTION },
    wms: { url: wmsTileUrl(env.WFS_BASE_URL, env.WFS_LAYER), minZoom: WMS_MIN_ZOOM },
  }
}

/** Origins the browser fetches map rasters from, for `img-src` and `connect-src`. */
export function mapSourceOrigins(sources: MapSources = mapSources()): string[] {
  const origins = [sources.baseTiles.url, sources.wms.url].map((url) => new URL(url).origin)
  return [...new Set(origins)]
}
