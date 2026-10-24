import type { FeatureCollection, Polygon } from 'geojson'
import type { Metadata } from 'next'
import { getPayload } from 'payload'

import config from '@payload-config'
import { MapView } from '@/components/map/map-view'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/guards'
import { previewCircle } from '@/lib/geo/buffer'
import type { LonLat } from '@/lib/geo/crs'
import { mapSources } from '@/lib/map-sources'

export const metadata: Metadata = { title: 'Vahtialueet' }
export const dynamic = 'force-dynamic'

/** Whole Finland, for an account without watch areas. */
const FINLAND_CENTER: LonLat = [25.7, 62.9]
const FINLAND_ZOOM = 4.5

export default async function DashboardPage() {
  const payload = await getPayload({ config })
  const user = await requireUser({ next: '/dashboard' })

  const [{ docs: areas }, { totalDocs: pendingAlerts }] = await Promise.all([
    payload.find({
      collection: 'watch-areas',
      user,
      overrideAccess: false,
      sort: 'name',
      limit: 100,
    }),
    payload.count({
      collection: 'alerts',
      user,
      overrideAccess: false,
      where: { notifiedAt: { exists: false } },
    }),
  ])

  const areaCircles: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: areas.map((a) => ({
      ...previewCircle(a.center as LonLat, a.radiusM),
      id: a.id,
      properties: { name: a.name },
    })),
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="text-2xl font-semibold">Vahtialueesi</h1>
        <p className="min-w-0 text-sm break-words text-muted-foreground">
          Kirjautunut: {user.email} · odottavia hälytyksiä: {pendingAlerts}
        </p>
      </div>

      <MapView
        center={(areas[0]?.center as LonLat | undefined) ?? FINLAND_CENTER}
        sources={mapSources()}
        watchAreaGeoJSON={areaCircles}
        zoom={areas.length > 0 ? undefined : FINLAND_ZOOM}
      />

      {areas.length === 0 ? (
        <p className="text-muted-foreground" data-testid="no-watch-areas">
          Sinulla ei ole vielä vahtialueita. Luo ensimmäinen ylläpidosta (Vahtialueet → Luo uusi).
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" data-testid="watch-area-list">
          {areas.map((area) => (
            <li key={area.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{area.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Säde {area.radiusM} m · keskipiste{' '}
                  {(area.center as [number, number])[1].toFixed(4)},{' '}
                  {(area.center as [number, number])[0].toFixed(4)}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
