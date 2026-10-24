import type { FeatureCollection, MultiPolygon } from 'geojson'
import type { Payload } from 'payload'

import { assertOwner } from '@/lib/auth/page-access'
import { NotFound } from '@/lib/errors'
import type { LonLat } from '@/lib/geo/crs'
import { type DeclarationMapProperties, declarationsForWatchArea } from '@/lib/geo/spatial-queries'
import type { User } from '@/payload-types'

/** A declaration of the area's map, plus whether the account has an unread alert for it. */
export type WatchAreaDeclarationProperties = DeclarationMapProperties & { isNew: boolean }

export type WatchAreaDeclarations = FeatureCollection<MultiPolygon, WatchAreaDeclarationProperties>

/** What `/vahtialueet/[id]` and `declarations.geojson` read (E05 MV-067). */
export type WatchAreaDetail = {
  area: {
    id: number
    name: string
    addressLabel: string | null
    center: LonLat
    radiusM: number
    /** ISO time of the pipeline's last match of this area; null until the first one. */
    lastCheckedAt: string | null
  }
  declarations: WatchAreaDeclarations
}

/**
 * One watch area with the declarations its map shows (`declarationsForWatchArea()`: WGS 84,
 * intersecting, not removed, valid at `now`, newest first). `isNew` is true while the account
 * has an unread alert of this area for the declaration (`alerts.readAt` unset), the same rule
 * as the "Uusia: N" badge of `/vahtialueet`. A missing area is `NotFound`; someone else's area
 * is `Forbidden` for everyone, admins included (`assertOwner()`: the app pages are personal),
 * so the area is read with `overrideAccess` and the owner check is the only gate.
 */
export async function loadWatchAreaDetail(
  payload: Payload,
  user: User,
  id: number,
  now: Date = new Date(),
): Promise<WatchAreaDetail> {
  const area = await payload.findByID({
    collection: 'watch-areas',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })
  if (!area) throw new NotFound()
  assertOwner(user, area)

  const [geojson, { docs: unread }] = await Promise.all([
    declarationsForWatchArea(payload, area.id, now),
    payload.find({
      collection: 'alerts',
      where: {
        and: [
          { user: { equals: user.id } },
          { watchArea: { equals: area.id } },
          { readAt: { exists: false } },
        ],
      },
      select: { declaration: true },
      depth: 0,
      pagination: false,
      overrideAccess: false,
      user,
    }),
  ])
  const unreadIds = new Set(
    unread.map((a) => (typeof a.declaration === 'number' ? a.declaration : a.declaration.id)),
  )

  return {
    area: {
      id: area.id,
      name: area.name,
      addressLabel: area.addressLabel ?? null,
      center: area.center as LonLat,
      radiusM: area.radiusM,
      lastCheckedAt: area.lastCheckedAt ?? null,
    },
    declarations: {
      type: 'FeatureCollection',
      features: geojson.features.map((f) => ({
        ...f,
        properties: { ...f.properties, isNew: unreadIds.has(Number(f.id)) },
      })),
    },
  }
}
