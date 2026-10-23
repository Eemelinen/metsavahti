'use client'

import dynamic from 'next/dynamic'

import type { WatchAreaMapProps } from '@/components/map/watch-area-map'

// MapLibre touches `window`; keep it out of the server bundle.
const WatchAreaMap = dynamic(
  () => import('@/components/map/watch-area-map').then((m) => m.WatchAreaMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-105 w-full animate-pulse rounded-lg bg-muted" data-testid="map-loading" />
    ),
  },
)

export function WatchAreaMapClient(props: WatchAreaMapProps) {
  return <WatchAreaMap {...props} />
}
