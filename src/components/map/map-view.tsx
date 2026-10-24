'use client'

import dynamic from 'next/dynamic'

import type { MapViewProps } from '@/components/map/map-view-canvas'

// MapLibre needs `window` and WebGL; keep it out of the server render.
const MapViewCanvas = dynamic(
  () => import('@/components/map/map-view-canvas').then((m) => m.MapViewCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        aria-busy="true"
        className="h-105 w-full animate-pulse rounded-xl bg-muted"
        data-testid="map-loading"
      />
    ),
  },
)

/** The reusable map (MV-060); props in `map-view-canvas.tsx`. Safe to render from any page. */
export function MapView(props: MapViewProps) {
  return <MapViewCanvas {...props} />
}
