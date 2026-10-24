import { attrHash, geomHash } from '@/lib/geo/hash'
import { cuttingType } from '@/lib/wfs/codes'
import {
  AREA_FIELD,
  CUTTING_TYPE_FIELD,
  DATE_FIELDS,
  DECLARATION_NUMBER_FIELD,
} from '@/lib/wfs/layer'
import type {
  DeclarationFeature,
  DeclarationFeatureCollection,
  DeclarationGeometry,
} from '@/lib/wfs/schemas'

/**
 * `WfsFeature` (one validated stand from `GetFeature`) → `NormalisedDeclaration`, the shape
 * the pipeline stores in `declarations` (`01 §4.1` step 3, MV-024).
 *
 * - Geometry is always a MultiPolygon in EPSG:3067, as the `geom` column; `geomHash` is
 *   taken from it, so a stand the source switches between Polygon and MultiPolygon keeps
 *   its hash.
 * - Dates become UTC ISO strings; `receivedAt` is the declaration's arrival date (the
 *   stand's when the declaration's is missing) and `validUntil` three years later.
 * - `municipalityCode` is always `null`: the layer has no municipality attribute
 *   (`layer.ts`, ledger S19).
 */

export type DeclarationMultiPolygon = Extract<DeclarationGeometry, { type: 'MultiPolygon' }>

export type NormalisedDeclaration = {
  sourceId: string
  declarationNumber: string
  cuttingTypeCode: number | null
  cuttingTypeLabel: string
  areaHa: number | null
  receivedAt: string | null
  validUntil: string | null
  municipalityCode: string | null
  geometry: DeclarationMultiPolygon
  geomHash: string
  attrHash: string
  rawAttributes: DeclarationFeature['properties']
}

/** A declaration stays valid for three years from the day Metsäkeskus received it (`01 §3.3`). */
export const DECLARATION_VALIDITY_YEARS = 3

const SOURCE_TIME_ZONE = 'Europe/Helsinki'

const ZONED_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/

const helsinkiOffsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SOURCE_TIME_ZONE,
  timeZoneName: 'longOffset',
})

/** Offset of Finnish time from UTC at `instant`, in minutes (120 or 180). */
function helsinkiOffsetMinutes(instant: number): number {
  const name = helsinkiOffsetFormat
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '')
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === '-' ? -minutes : minutes
}

/**
 * A WFS date value → UTC ISO string, or `null` when it is missing or not a date.
 * The JSON output sends ISO 8601 with an offset (`2025-09-11T15:31:58+03:00`); a value
 * without one (a bare date, or a date-time without a zone) is read as Finnish time.
 */
export function parseSourceDate(value: string | null | undefined): string | null {
  if (value == null) return null
  const text = value.trim()
  if (ZONED_DATE_TIME.test(text)) {
    const ms = Date.parse(text)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
  }
  const local = LOCAL_DATE_TIME.exec(text)
  if (!local) return null
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '0'] = local
  const asUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
    Math.round(Number(`0.${frac}`) * 1000),
  )
  const roundTrip = new Date(asUtc)
  // Reject rolled-over values such as 2025-02-30 or 25:00.
  if (
    roundTrip.getUTCFullYear() !== Number(y) ||
    roundTrip.getUTCMonth() !== Number(mo) - 1 ||
    roundTrip.getUTCDate() !== Number(d) ||
    roundTrip.getUTCHours() !== Number(h) ||
    roundTrip.getUTCMinutes() !== Number(mi)
  ) {
    return null
  }
  const offset = helsinkiOffsetMinutes(asUtc - helsinkiOffsetMinutes(asUtc) * 60_000)
  return new Date(asUtc - offset * 60_000).toISOString()
}

/**
 * `receivedAt` + three years, as a UTC ISO string. A declaration received on 29 February
 * stays valid until 28 February (no roll-over into March).
 */
export function validUntilFor(receivedAt: string | Date): string {
  const d = new Date(receivedAt)
  const month = d.getUTCMonth()
  d.setUTCFullYear(d.getUTCFullYear() + DECLARATION_VALIDITY_YEARS)
  if (d.getUTCMonth() !== month) d.setUTCDate(0)
  return d.toISOString()
}

function toMultiPolygon(geometry: DeclarationGeometry): DeclarationMultiPolygon {
  if (geometry.type === 'MultiPolygon') return geometry
  return { type: 'MultiPolygon', coordinates: [geometry.coordinates] }
}

export function normaliseFeature(feature: DeclarationFeature): NormalisedDeclaration {
  const p = feature.properties
  const code = p[CUTTING_TYPE_FIELD] ?? null
  const receivedAt =
    parseSourceDate(p[DATE_FIELDS.received]) ?? parseSourceDate(p[DATE_FIELDS.standReceived])
  const geometry = toMultiPolygon(feature.geometry)
  return {
    sourceId: feature.id,
    declarationNumber: p[DECLARATION_NUMBER_FIELD],
    cuttingTypeCode: code,
    cuttingTypeLabel: cuttingType(code).label_fi,
    areaHa: p[AREA_FIELD] ?? null,
    receivedAt,
    validUntil: receivedAt == null ? null : validUntilFor(receivedAt),
    municipalityCode: null,
    geometry,
    geomHash: geomHash(geometry),
    attrHash: attrHash(p),
    rawAttributes: p,
  }
}

export function normaliseFeatures(
  collection: DeclarationFeatureCollection,
): NormalisedDeclaration[] {
  return collection.features.map(normaliseFeature)
}
