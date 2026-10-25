'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { bbox as turfBbox } from '@turf/turf'
import { cn } from 'cn'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { getVersion, setWorkerUrl } from 'maplibre-gl'
import { type KeyboardEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import {
  AttributionControl,
  type FillLayerSpecification,
  Layer,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  type MapLayerMouseEvent,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
  type StyleSpecification,
} from 'react-map-gl/maplibre'

type FillColor = NonNullable<FillLayerSpecification['paint']>['fill-color']

import { DeclarationList } from '@/components/map/declaration-list'
import {
  DeclarationPopover,
  type MapDeclaration,
  type MapDeclarationProperties,
} from '@/components/map/declaration-popover'
import { MapLegend } from '@/components/map/map-legend'
import type { CuttingColourToken } from '@/config/cutting-types'
import { metsakeskusAttribution } from '@/lib/attribution'
import { mapColors } from '@/lib/design-tokens'
import { previewCircle } from '@/lib/geo/buffer'
import type { LonLat } from '@/lib/geo/crs'
import type { MapSources } from '@/lib/map-sources'
import { maplibreWorkerUrl } from '@/lib/maplibre-worker'
import { cuttingColourToken } from '@/lib/wfs/codes'

// Next's bundle lacks maplibre-gl's worker file; load it from our own route (D-035).
setWorkerUrl(maplibreWorkerUrl(getVersion()))

type AreaGeometry = Polygon | MultiPolygon

export type MapViewProps = {
  /** Tile and WMS URLs from `mapSources()` (server). */
  sources: MapSources
  /** [lon, lat] of the watch area, or of the pin in interactive mode. */
  center: LonLat
  /** Radius of the watch circle; drawn with `previewCircle()` when `watchAreaGeoJSON` is absent. */
  radiusM?: number
  /** Watch area(s) to draw instead of the circle; the pin is then left out unless interactive. */
  watchAreaGeoJSON?: Feature<AreaGeometry> | FeatureCollection<AreaGeometry>
  /**
   * Declarations layer, e.g. `declarationsForWatchArea()`; coloured by the `cut` tokens. A
   * click on a polygon opens its `DeclarationPopover`, and a list under the map mirrors the
   * polygons; a feature's `detailHref` is the target of "Näytä tiedot".
   */
  declarationsGeoJSON?: FeatureCollection<AreaGeometry, MapDeclarationProperties>
  /**
   * Controlled selection: the declaration whose popover is open. When it changes from outside
   * (a list of the page's own), the map moves to that polygon; a polygon click reports through
   * `onSelectedDeclarationChange`. Left out, the map keeps the selection itself.
   */
  selectedDeclarationId?: MapDeclaration['id'] | null
  onSelectedDeclarationChange?: (id: MapDeclaration['id'] | null) => void
  /** `false` leaves out the list under the map, for a page that renders its own (R37). */
  declarationList?: boolean
  /**
   * Placement mode: the pin can be dragged or moved with the arrow keys, a map click moves it
   * (declarations then open no popover; the list still selects them).
   */
  interactive?: boolean
  onCenterChange?: (center: LonLat) => void
  /** Zoom when there is no watch area to fit. */
  zoom?: number
  /**
   * What the map opens on: the watch area (default) or the declarations, as the alert page
   * zooms to its polygon (MV-082). "Keskitä vahtialueeseen" always fits the watch area.
   */
  fit?: 'watchArea' | 'declarations'
  className?: string
}

const DEFAULT_ZOOM = 11
const FIT_PADDING = 40
/** Arrow key step of the pin in screen pixels; Shift moves five steps. */
const PIN_STEP_PX = 10
const ARROW_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

/** Finnish labels of MapLibre's own controls (its defaults are English). */
const MAP_LOCALE = {
  'Map.Title': 'Kartta',
  'NavigationControl.ZoomIn': 'Lähennä',
  'NavigationControl.ZoomOut': 'Loitonna',
  'NavigationControl.ResetBearing': 'Palauta pohjoinen ylös',
  'AttributionControl.ToggleAttribution': 'Näytä tai piilota aineistolähteet',
}

const OVERLAY_BUTTON =
  'inline-flex min-h-10 items-center rounded-lg bg-paper-raised/95 px-3 py-2 text-sm font-semibold text-forest-700 shadow-card outline-none hover:bg-paper-raised focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-forest-700 aria-pressed:text-paper-raised'

/** `fill-color` / `line-color` of a declaration by its `colourToken` property. */
function byColourToken(palette: Record<CuttingColourToken, string>): FillColor {
  return [
    'match',
    ['get', 'colourToken'],
    'harvennus',
    palette.harvennus,
    'uudistus',
    palette.uudistus,
    palette.muu,
  ]
}

function baseStyle({ url, attribution }: MapSources['baseTiles']): StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles: [url], tileSize: 256, maxzoom: 19, attribution } },
    // Muted like the artboard's map (`docs/design/map.js`) so the overlays stand out.
    layers: [
      {
        id: 'base',
        type: 'raster',
        source: 'base',
        paint: { 'raster-saturation': -0.35, 'raster-brightness-max': 0.96 },
      },
    ],
  }
}

function boundsOf(collection: FeatureCollection | null): LngLatBoundsLike | undefined {
  if (!collection || collection.features.length === 0) return undefined
  const [west, south, east, north] = turfBbox(collection)
  return [
    [west, south],
    [east, north],
  ]
}

/**
 * The map of MV-060 (`03-pages.md` → `MapView`): base raster, the optional Metsäkeskus WMS
 * layer, declarations by harvest type, the watch area, legend, "Keskitä vahtialueeseen",
 * zoom buttons, attribution, and in interactive mode a pin that reports `onCenterChange`.
 * Browser only: render it through `MapView` (`map-view.tsx`), which loads this module
 * without SSR.
 */
export function MapViewCanvas({
  sources,
  center,
  radiusM,
  watchAreaGeoJSON,
  declarationsGeoJSON,
  selectedDeclarationId,
  onSelectedDeclarationChange,
  declarationList = true,
  interactive = false,
  onCenterChange,
  zoom = DEFAULT_ZOOM,
  fit = 'watchArea',
  className,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [wmsOn, setWmsOn] = useState(false)
  const [currentZoom, setCurrentZoom] = useState<number | null>(null)
  const [ownSelectedId, setOwnSelectedId] = useState<MapDeclaration['id'] | null>(null)
  const controlled = selectedDeclarationId !== undefined
  const selectedId = controlled ? selectedDeclarationId : ownSelectedId
  /** The id a polygon click just reported, so the controlled update it causes does not fit. */
  const clickedId = useRef<MapDeclaration['id'] | null | undefined>(undefined)
  const [overDeclaration, setOverDeclaration] = useState(false)

  const mapStyle = useMemo(() => baseStyle(sources.baseTiles), [sources.baseTiles])

  const watchArea = useMemo<FeatureCollection<AreaGeometry> | null>(() => {
    if (watchAreaGeoJSON) {
      return watchAreaGeoJSON.type === 'FeatureCollection'
        ? watchAreaGeoJSON
        : { type: 'FeatureCollection', features: [watchAreaGeoJSON] }
    }
    if (radiusM === undefined) return null
    return { type: 'FeatureCollection', features: [previewCircle(center, radiusM)] }
  }, [watchAreaGeoJSON, radiusM, center])

  const declarations = useMemo(
    () =>
      declarationsGeoJSON && {
        ...declarationsGeoJSON,
        features: declarationsGeoJSON.features.map((f, i) => ({
          ...f,
          // The popover and the list find a clicked polygon by its feature id.
          id: f.id ?? i,
          properties: {
            ...f.properties,
            colourToken: cuttingColourToken(f.properties.cuttingTypeCode),
          },
        })),
      },
    [declarationsGeoJSON],
  )

  const selected = declarations?.features.find((f) => f.id === selectedId) ?? null

  function setSelectedId(id: MapDeclaration['id'] | null) {
    if (!controlled) setOwnSelectedId(id)
    onSelectedDeclarationChange?.(id)
  }

  function fitDeclaration(id: MapDeclaration['id']) {
    const feature = declarations?.features.find((f) => f.id === id)
    const bounds = feature && boundsOf({ type: 'FeatureCollection', features: [feature] })
    if (bounds) mapRef.current?.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 15 })
  }

  // A controlled selection made outside the map ("Näytä kartalla" of the page's list).
  const fitSelected = useEffectEvent(fitDeclaration)
  useEffect(() => {
    if (!controlled) return
    const fromClick = clickedId.current === selectedDeclarationId
    clickedId.current = undefined
    if (selectedDeclarationId != null && !fromClick) fitSelected(selectedDeclarationId)
  }, [controlled, selectedDeclarationId])

  const areaBounds = useMemo(() => boundsOf(watchArea), [watchArea])
  // Captured once: later prop changes move the overlays, not the camera.
  const [initialViewState] = useState(() => {
    const bounds = (fit === 'declarations' && boundsOf(declarations ?? null)) || areaBounds
    return bounds
      ? { bounds, fitBoundsOptions: { padding: FIT_PADDING, maxZoom: 15 } }
      : { longitude: center[0], latitude: center[1], zoom }
  })

  const showPin = interactive || watchAreaGeoJSON === undefined
  // The WMS goes under our own layers.
  const overlayBeforeId = declarations
    ? 'declarations-fill'
    : watchArea
      ? 'watch-area-fill'
      : undefined

  function recenter() {
    const map = mapRef.current
    if (!map) return
    if (areaBounds) map.fitBounds(areaBounds, { padding: FIT_PADDING, maxZoom: 15 })
    else map.flyTo({ center, zoom })
  }

  function onMapClick(event: MapLayerMouseEvent) {
    if (interactive) {
      onCenterChange?.([event.lngLat.lng, event.lngLat.lat])
      return
    }
    // `features` holds the hit `declarations-fill` polygons; a click beside them closes the popover.
    const id = event.features?.[0]?.id ?? null
    clickedId.current = id
    setSelectedId(id)
  }

  function showDeclaration(declaration: MapDeclaration) {
    // Fitted here; the controlled update this causes must not fit a second time.
    clickedId.current = declaration.id
    setSelectedId(declaration.id)
    fitDeclaration(declaration.id)
  }

  function movePin(event: KeyboardEvent<HTMLButtonElement>) {
    const direction = ARROW_KEYS[event.key]
    if (!direction) return
    // Keep MapLibre's own keyboard handler from panning the map as well.
    event.preventDefault()
    event.stopPropagation()
    const mapZoom = mapRef.current?.getZoom() ?? zoom
    // Degrees of longitude per pixel at this zoom (512 px world tiles); latitude shrinks by cos.
    const step = ((event.shiftKey ? 5 : 1) * PIN_STEP_PX * 360) / (512 * 2 ** mapZoom)
    const [lon, lat] = center
    onCenterChange?.([
      lon + direction[0] * step,
      lat + direction[1] * step * Math.cos((lat * Math.PI) / 180),
    ])
  }

  function onIdle() {
    if (ready) return
    setReady(true)
    // Start with the compact attribution folded, as on the artboard; the "i" button opens it.
    const attribution = containerRef.current?.querySelector('.maplibregl-ctrl-attrib')
    attribution?.classList.remove('maplibregl-compact-show')
    attribution?.removeAttribute('open')
  }

  return (
    <>
      <div
        className={cn(
          'relative h-105 w-full overflow-hidden rounded-xl border border-line bg-paper-sunken',
          className,
        )}
        data-map-ready={ready ? 'true' : 'false'}
        data-testid="map-view"
        ref={containerRef}
      >
        <MapLibreMap
          attributionControl={false}
          cursor={overDeclaration ? 'pointer' : undefined}
          initialViewState={initialViewState}
          interactiveLayerIds={declarations && !interactive ? ['declarations-fill'] : undefined}
          locale={MAP_LOCALE}
          mapStyle={mapStyle}
          onClick={interactive || declarations ? onMapClick : undefined}
          onIdle={onIdle}
          onLoad={(e) => setCurrentZoom(e.target.getZoom())}
          onMouseEnter={() => setOverDeclaration(true)}
          onMouseLeave={() => setOverDeclaration(false)}
          onZoomEnd={(e) => setCurrentZoom(e.viewState.zoom)}
          ref={mapRef}
          // eslint-disable-next-line react/forbid-component-props -- react-map-gl sizes the canvas through `style`
          style={{ width: '100%', height: '100%' }}
        >
          {wmsOn ? (
            <Source
              id="metsakeskus-wms"
              // 256 px tiles load one zoom level above the map zoom.
              minzoom={sources.wms.minZoom + 1}
              tileSize={256}
              tiles={[sources.wms.url]}
              type="raster"
            >
              <Layer beforeId={overlayBeforeId} id="metsakeskus-wms" type="raster" />
            </Source>
          ) : null}
          {declarations ? (
            <Source data={declarations} id="declarations" type="geojson">
              <Layer
                id="declarations-fill"
                paint={{ 'fill-color': byColourToken(mapColors.cut), 'fill-opacity': 0.5 }}
                type="fill"
              />
              <Layer
                id="declarations-line"
                paint={{ 'line-color': byColourToken(mapColors.cutLine), 'line-width': 1.5 }}
                type="line"
              />
              {selected ? (
                <Layer
                  filter={['==', ['id'], selected.id]}
                  id="declarations-selected"
                  paint={{ 'line-color': mapColors.marker, 'line-width': 3 }}
                  type="line"
                />
              ) : null}
            </Source>
          ) : null}
          {watchArea ? (
            <Source data={watchArea} id="watch-area" type="geojson">
              <Layer
                id="watch-area-fill"
                paint={{ 'fill-color': mapColors.watchAreaFill, 'fill-opacity': 0.12 }}
                type="fill"
              />
              <Layer
                id="watch-area-line"
                paint={{
                  'line-color': mapColors.watchAreaLine,
                  'line-width': 2,
                  'line-dasharray': [2, 1.5],
                }}
                type="line"
              />
            </Source>
          ) : null}
          {showPin ? (
            <Marker
              draggable={interactive}
              latitude={center[1]}
              longitude={center[0]}
              onDragEnd={(e) => onCenterChange?.([e.lngLat.lng, e.lngLat.lat])}
            >
              {interactive ? (
                <button
                  aria-label="Vahtialueen keskipiste: siirrä vetämällä tai nuolinäppäimillä"
                  className="block size-4 cursor-grab rounded-full border-3 border-paper-raised bg-forest-700 shadow-pop outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  data-testid="map-pin"
                  onKeyDown={movePin}
                  type="button"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="block size-3.5 rounded-full border-3 border-paper-raised bg-forest-700 shadow-pop"
                  data-testid="map-pin"
                />
              )}
            </Marker>
          ) : null}
          <NavigationControl position="top-right" showCompass={false} />
          <AttributionControl
            compact
            customAttribution={metsakeskusAttribution()}
            position="bottom-right"
          />
        </MapLibreMap>

        <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
          <button className={OVERLAY_BUTTON} onClick={recenter} type="button">
            Keskitä vahtialueeseen
          </button>
          <button
            aria-pressed={wmsOn}
            className={OVERLAY_BUTTON}
            onClick={() => setWmsOn((on) => !on)}
            type="button"
          >
            Metsäkeskuksen karttataso
          </button>
          <p aria-live="polite" className="text-xs">
            {wmsOn && currentZoom !== null && currentZoom < sources.wms.minZoom ? (
              <span className="rounded-lg bg-paper-raised/95 px-3 py-1.5 text-ink-muted shadow-card">
                Lähennä karttaa nähdäksesi tason
              </span>
            ) : null}
          </p>
        </div>

        <MapLegend className="absolute bottom-3 left-3" />

        {selected ? (
          <DeclarationPopover
            className="absolute right-3 bottom-11 left-3 sm:left-auto sm:w-70"
            declaration={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
      {declarations && declarationList ? (
        <DeclarationList
          className="mt-3"
          declarations={declarations.features}
          onShow={showDeclaration}
          selectedId={selected?.id ?? null}
        />
      ) : null}
    </>
  )
}
