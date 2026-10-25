import type { Feature, MultiPolygon } from 'geojson'
import type { Payload } from 'payload'

import { visibleChangeTypes } from '@/lib/alerts/change-types'
import { assertOwner } from '@/lib/auth/page-access'
import { NotFound } from '@/lib/errors'
import type { LonLat } from '@/lib/geo/crs'
import { type DeclarationMapProperties, declarationForWatchArea } from '@/lib/geo/spatial-queries'
import { cuttingType } from '@/lib/wfs/codes'
import {
  type AlertChangeType,
  type AlertSnapshot,
  alertSnapshot,
} from '@/payload/collections/Alerts'
import type { User } from '@/payload-types'

/** A snapshot fact that no longer matches the declaration (`Tiedot päivittyneet`). */
export type AlertDetailChange =
  | { field: 'cuttingType'; was: string | null; now: string }
  | { field: 'areaHa'; was: number | null; now: number | null }
  | { field: 'receivedAt'; was: string | null; now: string | null }

/** What `/ilmoitukset/[id]` shows (E07 MV-082, App artboard `ilmoitus`). */
export type AlertDetail = {
  id: number
  changeType: AlertChangeType
  unread: boolean
  createdAt: string
  watchArea: { id: number; name: string; center: LonLat; radiusM: number }
  /** The facts the alert was about, frozen at alert time (`01 §3.5`). */
  snapshot: AlertSnapshot
  /** The declaration's current code (as the feed and the email): label, explanation, colour. */
  cuttingTypeCode: number | null
  declarationNumber: string | null
  validUntil: string | null
  /** The polygon (WGS 84) with its current facts; null when the row is gone. */
  declaration: Feature<MultiPolygon, DeclarationMapProperties> | null
  /**
   * Whether the declaration changed after the alert: a revision or a removal from the data
   * since `createdAt`, or a snapshot fact that no longer matches. Null when nothing changed.
   */
  updated: { removed: boolean; changes: AlertDetailChange[] } | null
}

const relationId = (ref: number | { id: number }) => (typeof ref === 'number' ? ref : ref.id)

const after = (at: string | null | undefined, since: string) =>
  at != null && new Date(at).getTime() > new Date(since).getTime()

/** The UTC day of a stored date (the snapshot and the row may spell the same time differently). */
function day(at: string | null): string | null {
  const time = at == null ? NaN : new Date(at).getTime()
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10)
}

/**
 * One of the account's alerts with its watch area and declaration (E07 MV-082). A missing
 * alert, or one of a change type the app hides (`removed` while `ALERT_ON_REMOVED` is off), is
 * `NotFound`; someone else's is `Forbidden` for everyone, admins included (`assertOwner()`: the
 * app pages are personal). `declarations` and `declaration-revisions` are admin-only, so they
 * are read with `overrideAccess` for the owned alert's declaration only.
 */
export async function loadAlertDetail(
  payload: Payload,
  user: User,
  id: number,
): Promise<AlertDetail> {
  const alert = await payload.findByID({
    collection: 'alerts',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
  })
  if (!alert) throw new NotFound()
  assertOwner(user, alert)
  if (!visibleChangeTypes().includes(alert.changeType)) throw new NotFound()

  const watchAreaId = relationId(alert.watchArea)
  const declarationId = relationId(alert.declaration)
  const [area, row, feature, { docs: revisions }] = await Promise.all([
    payload.findByID({
      collection: 'watch-areas',
      id: watchAreaId,
      select: { name: true, center: true, radiusM: true },
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
    }),
    payload.findByID({
      collection: 'declarations',
      id: declarationId,
      select: {
        declarationNumber: true,
        cuttingTypeCode: true,
        cuttingTypeLabel: true,
        areaHa: true,
        receivedAt: true,
        validUntil: true,
        removedAt: true,
      },
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
    }),
    declarationForWatchArea(payload, watchAreaId, declarationId),
    payload.find({
      collection: 'declaration-revisions',
      where: {
        and: [
          { declaration: { equals: declarationId } },
          { changedAt: { greater_than: alert.createdAt } },
        ],
      },
      select: { changedAt: true },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
  ])
  if (!area) throw new NotFound()

  const snapshot = alertSnapshot(alert)
  const changes: AlertDetailChange[] = []
  let removed = false
  if (row) {
    // The stored label, as the snapshot took it: a relabelled code list is no change.
    const label = row.cuttingTypeLabel ?? null
    if (
      snapshot.cuttingTypeLabel !== null &&
      label !== null &&
      label !== snapshot.cuttingTypeLabel
    ) {
      changes.push({
        field: 'cuttingType',
        was: snapshot.cuttingTypeLabel,
        now: cuttingType(row.cuttingTypeCode).label_fi,
      })
    }
    if ((row.areaHa ?? null) !== snapshot.areaHa) {
      changes.push({ field: 'areaHa', was: snapshot.areaHa, now: row.areaHa ?? null })
    }
    if (day(row.receivedAt ?? null) !== day(snapshot.receivedAt)) {
      changes.push({ field: 'receivedAt', was: snapshot.receivedAt, now: row.receivedAt ?? null })
    }
    removed = alert.changeType !== 'removed' && after(row.removedAt, alert.createdAt)
  }
  const updated = removed || changes.length > 0 || revisions.length > 0

  return {
    id: alert.id,
    changeType: alert.changeType,
    unread: !alert.readAt,
    createdAt: alert.createdAt,
    watchArea: {
      id: area.id,
      name: area.name,
      center: area.center as LonLat,
      radiusM: area.radiusM,
    },
    snapshot,
    cuttingTypeCode: row?.cuttingTypeCode ?? null,
    declarationNumber: row?.declarationNumber ?? null,
    validUntil: row?.validUntil ?? null,
    declaration: feature,
    updated: updated ? { removed, changes } : null,
  }
}
