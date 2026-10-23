'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, Polygon } from 'geojson'
import { useMemo } from 'react'
import {
  Layer,
  Map as MapLibreMap,
  Marker,
  Source,
  type StyleSpecification,
} from 'react-map-gl/maplibre'

import { mapColors } from '@/lib/design-tokens'
import { previewCircle } from '@/lib/geo/buffer'

export type MapWatchArea = {
  id: number
  name: string
  /** [lon, lat] */
  center: [number, number]
  radiusM: number
}

export type WatchAreaMapProps = {
  areas: MapWatchArea[]
}

/** OpenStreetMap raster tiles for the MVP; MML taustakartta later (needs an API key). */
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

const FINLAND_CENTER = { longitude: 25.7, latitude: 62.9, zoom: 4.5 }

export function WatchAreaMap({ areas }: WatchAreaMapProps) {
  const polygons = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: 'FeatureCollection',
      features: areas.map((a) => ({
        ...previewCircle(a.center, a.radiusM),
        id: a.id,
        properties: { name: a.name },
      })),
    }),
    [areas],
  )

  const first = areas[0]
  const initialViewState = first
    ? { longitude: first.center[0], latitude: first.center[1], zoom: 11 }
    : FINLAND_CENTER

  return (
    <div className="h-105 w-full overflow-hidden rounded-xl border" data-testid="watch-area-map">
      <MapLibreMap
        initialViewState={initialViewState}
        mapStyle={OSM_STYLE}
        // eslint-disable-next-line react/forbid-component-props -- react-map-gl sizes the canvas through `style`
        style={{ width: '100%', height: '100%' }}
      >
        <Source data={polygons} id="watch-areas" type="geojson">
          <Layer
            id="watch-areas-fill"
            paint={{ 'fill-color': mapColors.watchAreaFill, 'fill-opacity': 0.15 }}
            type="fill"
          />
          <Layer
            id="watch-areas-line"
            paint={{ 'line-color': mapColors.watchAreaLine, 'line-width': 2 }}
            type="line"
          />
        </Source>
        {areas.map((a) => (
          <Marker
            color={mapColors.marker}
            key={a.id}
            latitude={a.center[1]}
            longitude={a.center[0]}
          />
        ))}
      </MapLibreMap>
    </div>
  )
}
