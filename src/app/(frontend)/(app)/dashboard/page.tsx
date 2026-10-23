import type { Metadata } from 'next'
import { getPayload } from 'payload'

import config from '@payload-config'
import { WatchAreaMapClient } from '@/components/map/map-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/lib/auth/guards'

export const metadata: Metadata = { title: 'Vahtialueet' }
export const dynamic = 'force-dynamic'

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

  const mapAreas = areas.map((a) => ({
    id: a.id,
    name: a.name,
    center: a.center as [number, number],
    radiusM: a.radiusM,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="text-2xl font-semibold">Vahtialueesi</h1>
        <p className="min-w-0 text-sm break-words text-muted-foreground">
          Kirjautunut: {user.email} · odottavia hälytyksiä: {pendingAlerts}
        </p>
      </div>

      <WatchAreaMapClient areas={mapAreas} />

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
