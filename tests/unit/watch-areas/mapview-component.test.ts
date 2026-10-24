// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import {
  type ComponentProps,
  createElement,
  forwardRef,
  type ReactNode,
  type Ref,
  useImperativeHandle,
} from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapViewCanvas } from '@/components/map/map-view-canvas'
import { mapColors } from '@/lib/design-tokens'
import type { LonLat } from '@/lib/geo/crs'
import type { DeclarationMapProperties } from '@/lib/geo/spatial-queries'
import type { MapSources } from '@/lib/map-sources'

/**
 * MV-060: `MapViewCanvas` with `react-map-gl/maplibre` replaced by plain elements, so jsdom
 * (no WebGL) renders everything the component owns and the test can read what it hands to
 * MapLibre: the style, the sources, the layers' paint and the marker.
 */
type Props = Record<string, unknown> & { children?: ReactNode }
const maplibre = vi.hoisted(() => ({
  map: {} as Props,
  sources: {} as Record<string, Props>,
  layers: {} as Record<string, Props>,
  marker: null as Props | null,
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  getZoom: vi.fn(() => 12),
  setWorkerUrl: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({ getVersion: () => '6.7.0', setWorkerUrl: maplibre.setWorkerUrl }))
vi.mock('react-map-gl/maplibre', () => ({
  Map: forwardRef(function MockMap(props: Props, ref: Ref<unknown>) {
    // Every render of the component re-renders the map first: start a fresh registry.
    maplibre.map = props
    maplibre.sources = {}
    maplibre.layers = {}
    maplibre.marker = null
    useImperativeHandle(ref, () => ({
      fitBounds: maplibre.fitBounds,
      flyTo: maplibre.flyTo,
      getZoom: maplibre.getZoom,
    }))
    return createElement('div', { 'data-testid': 'maplibre' }, props.children)
  }),
  Source(props: Props) {
    maplibre.sources[props.id as string] = props
    return createElement('div', null, props.children)
  },
  Layer(props: Props) {
    maplibre.layers[props.id as string] = props
    return null
  },
  Marker(props: Props) {
    maplibre.marker = props
    return createElement('div', { 'data-testid': 'marker' }, props.children)
  },
  NavigationControl: () => null,
  AttributionControl: (props: Props) =>
    createElement('div', { 'data-testid': 'attribution' }, props.customAttribution as string),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SOURCES: MapSources = {
  baseTiles: {
    url: 'https://tiles.example.test/{z}/{x}/{y}.png',
    attribution: '© Esimerkkikartat',
  },
  wms: { url: 'https://wms.example.test/ows?BBOX={bbox-epsg-3857}', minZoom: 12 },
}
const CENTER: LonLat = [29.53, 62.42]

function renderMap(props: Partial<ComponentProps<typeof MapViewCanvas>> = {}) {
  return render(createElement(MapViewCanvas, { sources: SOURCES, center: CENTER, ...props }))
}

function square(lon: number, lat: number, d = 0.002): Polygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon, lat],
        [lon + d, lat],
        [lon + d, lat + d],
        [lon, lat + d],
        [lon, lat],
      ],
    ],
  }
}

function declarations(
  codes: Array<number | null>,
): FeatureCollection<MultiPolygon, DeclarationMapProperties> {
  return {
    type: 'FeatureCollection',
    features: codes.map((code, i) => ({
      type: 'Feature',
      id: i + 1,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [square(CENTER[0] + i * 0.01, CENTER[1]).coordinates],
      },
      properties: {
        sourceId: `forestusedeclaration.${i + 1}`,
        declarationNumber: `1-2026-00000${i}`,
        cuttingTypeCode: code,
        cuttingTypeLabel: null,
        areaHa: 1.2,
        receivedAt: '2026-10-01T00:00:00.000Z',
        validUntil: '2029-10-01T00:00:00.000Z',
        distanceM: 0,
      },
    })),
  }
}

describe('MapView (MapViewCanvas)', () => {
  it('loads the MapLibre worker from the same-origin route', async () => {
    vi.resetModules()
    await import('@/components/map/map-view-canvas')
    expect(maplibre.setWorkerUrl).toHaveBeenCalledWith('/maplibre-gl/6.7.0/maplibre-gl-worker.mjs')
  })

  it('renders the legend, the controls and both attributions without WebGL', () => {
    renderMap({ radiusM: 800 })

    const legend = screen.getByRole('list', { name: 'Karttaselite' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Uudistushakkuu', 'Harvennus', 'Muu'])
    expect(
      legend.querySelectorAll('.bg-cut-uudistus, .bg-cut-harvennus, .bg-cut-muu'),
    ).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Keskitä vahtialueeseen' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Metsäkeskuksen karttataso' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByTestId('attribution')).toHaveTextContent(
      /^Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa \d{2}\/\d{4}$/,
    )

    // The base map is the configured raster (MAP_TILE_URL) with its own attribution.
    const style = maplibre.map.mapStyle as {
      sources: { base: { tiles: string[]; attribution: string } }
    }
    expect(style.sources.base.tiles).toEqual([SOURCES.baseTiles.url])
    expect(style.sources.base.attribution).toBe('© Esimerkkikartat')
    expect(maplibre.map.attributionControl).toBe(false)
    expect(maplibre.map.locale).toMatchObject({ 'NavigationControl.ZoomIn': 'Lähennä' })
  })

  it('colours declarations by their cuttingType colour token', () => {
    renderMap({ radiusM: 800, declarationsGeoJSON: declarations([4, 1, 9, null, 999]) })

    const data = maplibre.sources.declarations?.data as FeatureCollection
    expect(data.features.map((f) => f.properties?.colourToken)).toEqual([
      'uudistus',
      'harvennus',
      'muu',
      'muu',
      'muu',
    ])
    const fill = maplibre.layers['declarations-fill']?.paint as Record<string, unknown>
    expect(fill['fill-color']).toEqual([
      'match',
      ['get', 'colourToken'],
      'harvennus',
      mapColors.cut.harvennus,
      'uudistus',
      mapColors.cut.uudistus,
      mapColors.cut.muu,
    ])
    const line = maplibre.layers['declarations-line']?.paint as Record<string, unknown>
    expect(line['line-color']).toContain(mapColors.cutLine.uudistus)
  })

  it('draws the watch circle, fits it on load and "Keskitä" fits it again', async () => {
    const user = userEvent.setup()
    renderMap({ radiusM: 800 })

    const area = maplibre.sources['watch-area']?.data as FeatureCollection<Polygon>
    expect(area.features).toHaveLength(1)
    expect(area.features[0]?.geometry.type).toBe('Polygon')
    const initial = maplibre.map.initialViewState as { bounds: [LonLat, LonLat] }
    const [[west, south], [east, north]] = initial.bounds
    // An 800 m circle around the centre: ~0.0144° of latitude each way.
    expect(south).toBeLessThan(CENTER[1])
    expect(north).toBeGreaterThan(CENTER[1])
    expect(north - south).toBeCloseTo((2 * 800) / 111_320, 3)
    expect(west).toBeLessThan(CENTER[0])
    expect(east).toBeGreaterThan(CENTER[0])
    expect(screen.getByTestId('map-pin')).toHaveAttribute('aria-hidden', 'true')

    await user.click(screen.getByRole('button', { name: 'Keskitä vahtialueeseen' }))
    expect(maplibre.fitBounds).toHaveBeenCalledWith(initial.bounds, expect.any(Object))
  })

  it('draws a given watch-area geometry without a pin, and centres on the point without one', async () => {
    const user = userEvent.setup()
    renderMap({
      watchAreaGeoJSON: { type: 'Feature', geometry: square(...CENTER), properties: {} },
    })
    expect((maplibre.sources['watch-area']?.data as FeatureCollection).features).toHaveLength(1)
    expect(screen.queryByTestId('map-pin')).not.toBeInTheDocument()

    cleanup()
    renderMap({ zoom: 5 })
    expect(maplibre.sources['watch-area']).toBeUndefined()
    expect(maplibre.map.initialViewState).toEqual({
      longitude: CENTER[0],
      latitude: CENTER[1],
      zoom: 5,
    })
    await user.click(screen.getByRole('button', { name: 'Keskitä vahtialueeseen' }))
    expect(maplibre.flyTo).toHaveBeenCalledWith({ center: CENTER, zoom: 5 })
  })

  it('toggles the Metsäkeskus WMS layer from the keyboard and hints below its zoom', async () => {
    const user = userEvent.setup()
    renderMap({ radiusM: 800, declarationsGeoJSON: declarations([1]) })
    expect(maplibre.sources['metsakeskus-wms']).toBeUndefined()
    act(() => (maplibre.map.onLoad as (e: unknown) => void)({ target: { getZoom: () => 11 } }))

    await user.tab()
    expect(screen.getByRole('button', { name: 'Keskitä vahtialueeseen' })).toHaveFocus()
    await user.tab()
    const toggle = screen.getByRole('button', { name: 'Metsäkeskuksen karttataso' })
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(maplibre.sources['metsakeskus-wms']).toMatchObject({
      type: 'raster',
      tiles: [SOURCES.wms.url],
      minzoom: 13,
      tileSize: 256,
    })
    // Under the declarations, not over them.
    expect(maplibre.layers['metsakeskus-wms']?.beforeId).toBe('declarations-fill')
    expect(screen.getByText('Lähennä karttaa nähdäksesi tason')).toBeVisible()

    act(() => (maplibre.map.onZoomEnd as (e: unknown) => void)({ viewState: { zoom: 14 } }))
    expect(screen.queryByText('Lähennä karttaa nähdäksesi tason')).not.toBeInTheDocument()

    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(maplibre.sources['metsakeskus-wms']).toBeUndefined()
  })

  it('reports onCenterChange from the arrow keys, a drag and a map click in interactive mode', async () => {
    const user = userEvent.setup()
    const onCenterChange = vi.fn()
    renderMap({ radiusM: 800, interactive: true, onCenterChange })
    expect(maplibre.marker?.draggable).toBe(true)

    const pin = screen.getByRole('button', { name: /Vahtialueen keskipiste/ })
    pin.focus()
    await user.keyboard('{ArrowRight}')
    // 10 px at zoom 12: 10 * 360 / (512 * 2^12) degrees of longitude.
    const step = (10 * 360) / (512 * 2 ** 12)
    expect(onCenterChange).toHaveBeenLastCalledWith([CENTER[0] + step, CENTER[1]])
    await user.keyboard('{Shift>}{ArrowUp}{/Shift}')
    const [lon, lat] = onCenterChange.mock.lastCall?.[0] as LonLat
    expect(lon).toBe(CENTER[0])
    expect(lat).toBeCloseTo(CENTER[1] + 5 * step * Math.cos((CENTER[1] * Math.PI) / 180), 10)

    act(() =>
      (maplibre.marker?.onDragEnd as (e: unknown) => void)({ lngLat: { lng: 29.6, lat: 62.5 } }),
    )
    expect(onCenterChange).toHaveBeenLastCalledWith([29.6, 62.5])
    act(() => (maplibre.map.onClick as (e: unknown) => void)({ lngLat: { lng: 29.7, lat: 62.6 } }))
    expect(onCenterChange).toHaveBeenLastCalledWith([29.7, 62.6])
  })

  it('keeps the pin fixed and ignores map clicks outside interactive mode', () => {
    renderMap({ radiusM: 800, onCenterChange: vi.fn() })
    expect(maplibre.marker?.draggable).toBe(false)
    expect(maplibre.map.onClick).toBeUndefined()
    expect(screen.queryByRole('button', { name: /Vahtialueen keskipiste/ })).not.toBeInTheDocument()
  })

  it('marks itself ready on the first idle and folds the compact attribution', () => {
    renderMap({ radiusM: 800 })
    const view = screen.getByTestId('map-view')
    expect(view).toHaveAttribute('data-map-ready', 'false')
    const attrib = document.createElement('details')
    attrib.className = 'maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show'
    attrib.setAttribute('open', '')
    view.append(attrib)

    act(() => (maplibre.map.onIdle as () => void)())
    expect(view).toHaveAttribute('data-map-ready', 'true')
    expect(attrib).not.toHaveClass('maplibregl-compact-show')
    expect(attrib).not.toHaveAttribute('open')
  })
})
