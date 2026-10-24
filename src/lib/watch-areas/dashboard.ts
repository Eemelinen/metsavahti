import type { Payload } from 'payload'

import { planLimits } from '@/config/plans'
import type { LonLat } from '@/lib/geo/crs'
import { activeDeclarationCounts } from '@/lib/geo/spatial-queries'
import type { User } from '@/payload-types'

/** One card of `/vahtialueet` (App artboard `vahtialueet`). */
export type DashboardWatchArea = {
  id: number
  name: string
  addressLabel: string | null
  center: LonLat
  radiusM: number
  notificationsEnabled: boolean
  /** ISO time of the pipeline's last match of this area; null until the first one. */
  lastCheckedAt: string | null
  /** Declarations in force inside the area now (`activeDeclarationCounts()`). */
  activeCount: number
  /** The account's unread alerts of this area (`alerts.readAt IS NULL`, as the nav badge). */
  newCount: number
}

export type WatchAreaDashboard = {
  areas: DashboardWatchArea[]
  /** The plan's `maxWatchAreas`; "Uusi vahtialue" is disabled once `areas` reaches it. */
  maxWatchAreas: number
  /** `finishedAt` of the latest succeeded `fetch-declarations` run; null before the first. */
  dataUpdatedAt: string | null
}

/**
 * Everything `/vahtialueet` shows (E05 MV-066, `03-pages.md`: "owner's watch areas + counts;
 * last pipeline run"). Areas and alerts are read as the account and filtered on it explicitly:
 * the collections' read access lets an admin see every account's rows, and the app pages are
 * personal. The status strip's run is pipeline-wide, not personal, so `job-runs` (admin-only)
 * is read with `overrideAccess` and only its finish time leaves this function.
 */
export async function loadWatchAreaDashboard(
  payload: Payload,
  user: User,
  now: Date = new Date(),
): Promise<WatchAreaDashboard> {
  const [{ docs: areas }, { docs: unread }, { docs: runs }] = await Promise.all([
    payload.find({
      collection: 'watch-areas',
      where: { owner: { equals: user.id } },
      sort: 'createdAt',
      depth: 0,
      pagination: false,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'alerts',
      where: { and: [{ user: { equals: user.id } }, { readAt: { exists: false } }] },
      select: { watchArea: true },
      depth: 0,
      pagination: false,
      overrideAccess: false,
      user,
    }),
    payload.find({
      collection: 'job-runs',
      where: {
        and: [{ task: { equals: 'fetch-declarations' } }, { status: { equals: 'succeeded' } }],
      },
      sort: '-finishedAt',
      select: { finishedAt: true },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const newCounts = new Map<number, number>()
  for (const alert of unread) {
    const areaId = typeof alert.watchArea === 'number' ? alert.watchArea : alert.watchArea.id
    newCounts.set(areaId, (newCounts.get(areaId) ?? 0) + 1)
  }
  const activeCounts = await activeDeclarationCounts(
    payload,
    areas.map((a) => a.id),
    now,
  )

  return {
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      addressLabel: a.addressLabel ?? null,
      center: a.center as LonLat,
      radiusM: a.radiusM,
      notificationsEnabled: a.notificationsEnabled !== false,
      lastCheckedAt: a.lastCheckedAt ?? null,
      activeCount: activeCounts.get(a.id) ?? 0,
      newCount: newCounts.get(a.id) ?? 0,
    })),
    maxWatchAreas: planLimits(user.plan).maxWatchAreas,
    dataUpdatedAt: runs[0]?.finishedAt ?? null,
  }
}

/** "500 m", "1 km", "1,5 km" (the artboard's `fmtRadius`). */
export function formatRadius(radiusM: number): string {
  return radiusM >= 1000
    ? `${(radiusM / 1000).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} km`
    : `${radiusM} m`
}
