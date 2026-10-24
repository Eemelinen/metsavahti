// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FeatureCollection, MultiPolygon } from 'geojson'
import {
  type ComponentProps,
  createElement,
  forwardRef,
  type ReactNode,
  type Ref,
  useImperativeHandle,
} from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DeclarationPopover,
  formatAreaHa,
  formatDistance,
  formatReceived,
  type MapDeclarationProperties,
} from '@/components/map/declaration-popover'
import { MapViewCanvas } from '@/components/map/map-view-canvas'
import type { LonLat } from '@/lib/geo/crs'
import type { MapSources } from '@/lib/map-sources'

/**
 * MV-061: the declaration popover and the list under the map. `react-map-gl/maplibre` is
 * replaced by plain elements as in `mapview-component.test.ts`, so the test can fire the map's
 * click with the polygons MapLibre would report and read the layers it hands over.
 */
type Props = Record<string, unknown> & { children?: ReactNode }
const maplibre = vi.hoisted(() => ({
  map: {} as Props,
  layers: {} as Record<string, Props>,
  fitBounds: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({ getVersion: () => '6.7.0', setWorkerUrl: vi.fn() }))
vi.mock('react-map-gl/maplibre', () => ({
  Map: forwardRef(function MockMap(props: Props, ref: Ref<unknown>) {
    maplibre.map = props
    maplibre.layers = {}
    useImperativeHandle(ref, () => ({
      fitBounds: maplibre.fitBounds,
      flyTo: vi.fn(),
      getZoom: () => 12,
    }))
    return createElement('div', { 'data-testid': 'maplibre' }, props.children)
  }),
  Source: (props: Props) => createElement('div', null, props.children),
  Layer(props: Props) {
    maplibre.layers[props.id as string] = props
    return null
  },
  Marker: (props: Props) => createElement('div', null, props.children),
  NavigationControl: () => null,
  AttributionControl: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SOURCES: MapSources = {
  baseTiles: { url: 'https://tiles.example.test/{z}/{x}/{y}.png', attribution: '© Esimerkki' },
  wms: { url: 'https://wms.example.test/ows?BBOX={bbox-epsg-3857}', minZoom: 12 },
}
const CENTER: LonLat = [29.53, 62.42]

function properties(overrides: Partial<MapDeclarationProperties> = {}): MapDeclarationProperties {
  return {
    sourceId: 'forestusedeclaration.1',
    declarationNumber: '1-2026-000001',
    cuttingTypeCode: 4,
    cuttingTypeLabel: 'Kaistalehakkuu',
    areaHa: 2.4,
    // Late evening UTC: already the next day in Finland.
    receivedAt: '2026-09-30T22:30:00.000Z',
    validUntil: '2029-09-30T22:30:00.000Z',
    distanceM: 350.4,
    detailHref: '/ilmoitukset/101',
    ...overrides,
  }
}

/** Three declarations east of the centre: a regeneration felling, a thinning and an unknown code. */
const DECLARATIONS: FeatureCollection<MultiPolygon, MapDeclarationProperties> = {
  type: 'FeatureCollection',
  features: [
    properties(),
    properties({
      sourceId: 'forestusedeclaration.2',
      cuttingTypeCode: 3,
      areaHa: 0.8,
      receivedAt: '2026-08-12T09:00:00.000Z',
      distanceM: 1234,
      detailHref: '/ilmoitukset/102',
    }),
    properties({
      sourceId: 'forestusedeclaration.3',
      cuttingTypeCode: null,
      areaHa: null,
      receivedAt: null,
      distanceM: 0,
      detailHref: undefined,
    }),
  ].map((props, i) => {
    const [lon, lat] = [CENTER[0] + 0.01 * (i + 1), CENTER[1]]
    return {
      type: 'Feature',
      id: 11 + i,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [lon, lat],
              [lon + 0.002, lat],
              [lon + 0.002, lat + 0.001],
              [lon, lat + 0.001],
              [lon, lat],
            ],
          ],
        ],
      },
      properties: props,
    }
  }),
}

function renderMap(props: Partial<ComponentProps<typeof MapViewCanvas>> = {}) {
  return render(
    createElement(MapViewCanvas, {
      sources: SOURCES,
      center: CENTER,
      radiusM: 2000,
      declarationsGeoJSON: DECLARATIONS,
      ...props,
    }),
  )
}

/** What MapLibre hands `onClick`: the hit polygons of `interactiveLayerIds`, topmost first. */
function clickMap(featureIds: number[], lngLat = { lng: CENTER[0], lat: CENTER[1] }) {
  act(() =>
    (maplibre.map.onClick as (e: unknown) => void)({
      lngLat,
      features: featureIds.map((id) => ({ id, layer: { id: 'declarations-fill' } })),
    }),
  )
}

describe('declaration formatting', () => {
  it('formats area, distance and received date the Finnish way', () => {
    expect(formatAreaHa(2.4)).toBe('2,4 ha')
    expect(formatAreaHa(12)).toBe('12 ha')
    expect(formatAreaHa(null)).toBe('– ha')
    expect(formatDistance(0)).toBe('0 m')
    expect(formatDistance(350.4)).toBe('350 m')
    expect(formatDistance(999.4)).toBe('999 m')
    expect(formatDistance(1234)).toBe('1,2 km')
    expect(formatReceived('2026-09-30T22:30:00.000Z')).toBe('1.10.2026')
    expect(formatReceived(null)).toBe('–')
  })
})

describe('DeclarationPopover', () => {
  it('shows the cutting type chip, area, distance, received date and "Näytä tiedot"', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      createElement(DeclarationPopover, {
        declaration: { id: 1, properties: properties() },
        onClose,
      }),
    )

    const popover = screen.getByRole('region', { name: /Kaistalehakkuu/ })
    expect(within(popover).getByText('Kaistalehakkuu').closest('[data-colour]')).toHaveAttribute(
      'data-colour',
      'uudistus',
    )
    expect(popover.querySelector('.bg-cut-uudistus')).not.toBeNull()
    expect(popover).toHaveTextContent('2,4 ha · 350 m keskipisteestä')
    expect(popover).toHaveTextContent('Ilmoitus saapunut 1.10.2026')
    expect(within(popover).getByRole('link', { name: /Näytä tiedot/ })).toHaveAttribute(
      'href',
      '/ilmoitukset/101',
    )

    await user.click(within(popover).getByRole('button', { name: 'Sulje' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    within(popover).getByRole('link').focus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('uses the plain-Finnish label and the muu colour for an unknown code, without a link when no href', () => {
    render(
      createElement(DeclarationPopover, {
        declaration: {
          id: 1,
          properties: properties({ cuttingTypeCode: 999, detailHref: undefined }),
        },
        onClose: vi.fn(),
      }),
    )
    const popover = screen.getByTestId('declaration-popover')
    expect(popover.querySelector('[data-colour]')).toHaveAttribute('data-colour', 'muu')
    expect(within(popover).queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('MapView declarations', () => {
  it('opens the popover of a clicked polygon and closes it from "Sulje" or a click beside it', async () => {
    const user = userEvent.setup()
    renderMap()
    expect(maplibre.map.interactiveLayerIds).toEqual(['declarations-fill'])
    expect(screen.queryByTestId('declaration-popover')).not.toBeInTheDocument()

    clickMap([12])
    const popover = screen.getByTestId('declaration-popover')
    expect(popover).toHaveTextContent('Harvennushakkuu')
    expect(popover).toHaveTextContent('0,8 ha · 1,2 km keskipisteestä')
    expect(popover).toHaveTextContent('Ilmoitus saapunut 12.8.2026')
    expect(within(popover).getByRole('link', { name: /Näytä tiedot/ })).toHaveAttribute(
      'href',
      '/ilmoitukset/102',
    )
    // The clicked polygon is outlined.
    expect(maplibre.layers['declarations-selected']?.filter).toEqual(['==', ['id'], 12])

    clickMap([11])
    expect(screen.getByTestId('declaration-popover')).toHaveTextContent('Kaistalehakkuu')

    await user.click(screen.getByRole('button', { name: 'Sulje' }))
    expect(screen.queryByTestId('declaration-popover')).not.toBeInTheDocument()
    expect(maplibre.layers['declarations-selected']).toBeUndefined()

    clickMap([13])
    expect(screen.getByTestId('declaration-popover')).toHaveTextContent('– ha · 0 m keskipisteestä')
    clickMap([])
    expect(screen.queryByTestId('declaration-popover')).not.toBeInTheDocument()
  })

  it('shows a pointer over the polygons', () => {
    renderMap()
    expect(maplibre.map.cursor).toBeUndefined()
    act(() => (maplibre.map.onMouseEnter as () => void)())
    expect(maplibre.map.cursor).toBe('pointer')
    act(() => (maplibre.map.onMouseLeave as () => void)())
    expect(maplibre.map.cursor).toBeUndefined()
  })

  it('mirrors the polygons in a keyboard-focusable list that opens the same popover', async () => {
    const user = userEvent.setup()
    renderMap()

    const list = screen.getByRole('list', { name: 'Kartan metsänkäyttöilmoitukset' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.querySelector('[data-colour]')?.textContent)).toEqual([
      'Kaistalehakkuu',
      'Harvennushakkuu',
      'Muu hakkuu',
    ])
    expect(rows[0]).toHaveTextContent('2,4 ha · 350 m keskipisteestä')
    expect(rows[0]).toHaveTextContent('Ilmoitus saapunut 1.10.2026')
    expect(within(rows[0]!).getByRole('link', { name: /Näytä tiedot/ })).toHaveAttribute(
      'href',
      '/ilmoitukset/101',
    )
    expect(within(rows[2]!).queryByRole('link')).not.toBeInTheDocument()

    // Reached with Tab after the map's own controls, and operated with the keyboard.
    const show = within(rows[1]!).getByRole('button', { name: 'Näytä kartalla' })
    expect(show).toHaveAttribute('aria-pressed', 'false')
    while (document.activeElement !== show) await user.tab()
    await user.keyboard('{Enter}')

    expect(show).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('declaration-popover')).toHaveTextContent('Harvennushakkuu')
    expect(maplibre.layers['declarations-selected']?.filter).toEqual(['==', ['id'], 12])
    // The map moves to the polygon's own box.
    const [[west, south], [east, north]] = maplibre.fitBounds.mock.lastCall?.[0] as [LonLat, LonLat]
    expect(west).toBeCloseTo(CENTER[0] + 0.02, 6)
    expect(east).toBeCloseTo(CENTER[0] + 0.022, 6)
    expect(south).toBeCloseTo(CENTER[1], 6)
    expect(north).toBeCloseTo(CENTER[1] + 0.001, 6)

    // A click on another polygon moves the selection in the list as well.
    clickMap([11])
    expect(within(rows[0]!).getByRole('button', { name: 'Näytä kartalla' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(show).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps map clicks for the pin in interactive mode', () => {
    const onCenterChange = vi.fn()
    renderMap({ interactive: true, onCenterChange })
    expect(maplibre.map.interactiveLayerIds).toBeUndefined()

    clickMap([12], { lng: 29.6, lat: 62.5 })
    expect(onCenterChange).toHaveBeenCalledWith([29.6, 62.5])
    expect(screen.queryByTestId('declaration-popover')).not.toBeInTheDocument()
  })

  it('leaves the list out for a page with its own and follows a controlled selection', () => {
    const onSelectedDeclarationChange = vi.fn()
    const view = renderMap({
      declarationList: false,
      selectedDeclarationId: null,
      onSelectedDeclarationChange,
    })
    expect(screen.queryByTestId('declaration-list')).not.toBeInTheDocument()

    // A polygon click only reports; the page decides the selection.
    clickMap([12])
    expect(onSelectedDeclarationChange).toHaveBeenLastCalledWith(12)
    expect(screen.queryByTestId('declaration-popover')).not.toBeInTheDocument()

    // The page's own list selects 12 after the click: the popover opens, the map stays put.
    view.rerender(
      createElement(MapViewCanvas, {
        sources: SOURCES,
        center: CENTER,
        radiusM: 2000,
        declarationsGeoJSON: DECLARATIONS,
        declarationList: false,
        selectedDeclarationId: 12,
        onSelectedDeclarationChange,
      }),
    )
    expect(screen.getByTestId('declaration-popover')).toHaveTextContent('Harvennushakkuu')
    expect(maplibre.fitBounds).not.toHaveBeenCalled()

    // A selection from outside the map ("Näytä kartalla" of the page's list) moves the map.
    view.rerender(
      createElement(MapViewCanvas, {
        sources: SOURCES,
        center: CENTER,
        radiusM: 2000,
        declarationsGeoJSON: DECLARATIONS,
        declarationList: false,
        selectedDeclarationId: 11,
        onSelectedDeclarationChange,
      }),
    )
    expect(screen.getByTestId('declaration-popover')).toHaveTextContent('Kaistalehakkuu')
    const [[west], [east]] = maplibre.fitBounds.mock.lastCall?.[0] as [LonLat, LonLat]
    expect(west).toBeCloseTo(CENTER[0] + 0.01, 6)
    expect(east).toBeCloseTo(CENTER[0] + 0.012, 6)

    // "Sulje" reports the cleared selection.
    act(() => screen.getByRole('button', { name: 'Sulje' }).click())
    expect(onSelectedDeclarationChange).toHaveBeenLastCalledWith(null)
  })

  it('renders no list without declarations', () => {
    renderMap({ declarationsGeoJSON: undefined })
    expect(screen.queryByTestId('declaration-list')).not.toBeInTheDocument()
    expect(maplibre.map.interactiveLayerIds).toBeUndefined()
  })
})
