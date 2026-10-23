import { createHash } from 'node:crypto'

import type { Geometry, Position } from 'geojson'
import { Geometry as WkxGeometry } from 'wkx'

/**
 * Content hashes for change detection (MV-025).
 *
 * `geomHash` answers "is this the same shape?" for geometries that come from the
 * Metsäkeskus WFS in EPSG:3067 (metres). Two geometries hash the same when they
 * describe the same shape, regardless of where a ring starts, which way it winds,
 * in which order holes or multipart members are listed, or sub-centimetre noise.
 * A vertex that moves by 2 cm or more changes the hash.
 *
 * `attrHash` answers "are these the same attributes?" for plain JSON objects,
 * regardless of key order.
 */

/** Coordinates are rounded to this many decimals before hashing (0.01 m = 1 cm in EPSG:3067). */
export const HASH_COORDINATE_DECIMALS = 2

const SCALE = 10 ** HASH_COORDINATE_DECIMALS

/** A coordinate tree: a number, a position, a ring, a polygon … */
type CoordTree = number | CoordTree[]

function roundOrdinate(value: number): number {
  // `+ 0` folds -0 into +0; WKB would otherwise encode them as different doubles.
  return Math.round(value * SCALE) / SCALE + 0
}

function roundPosition(position: Position): Position {
  return position.map(roundOrdinate)
}

/** Lexicographic order over coordinate trees; a shorter prefix sorts first. */
function compareCoords(a: CoordTree, b: CoordTree): number {
  if (typeof a === 'number' || typeof b === 'number') {
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
    return typeof a === 'number' ? -1 : 1
  }
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    const order = compareCoords(a[i] as CoordTree, b[i] as CoordTree)
    if (order !== 0) return order
  }
  return a.length - b.length
}

function samePosition(a: Position, b: Position): boolean {
  return compareCoords(a, b) === 0
}

/** Round every vertex and drop consecutive duplicates that rounding created. */
function roundLine(line: Position[]): Position[] {
  const out: Position[] = []
  for (const position of line) {
    const rounded = roundPosition(position)
    const previous = out[out.length - 1]
    if (previous === undefined || !samePosition(previous, rounded)) out.push(rounded)
  }
  return out
}

/** Pick the lexicographically smaller of a vertex sequence and its reverse. */
function canonicalDirection(line: Position[]): Position[] {
  const reversed = [...line].reverse()
  return compareCoords(reversed, line) < 0 ? reversed : line
}

/** An open path (LineString): rounded, deduplicated, direction-normalised. */
function canonicalLine(line: Position[]): Position[] {
  return canonicalDirection(roundLine(line))
}

/**
 * A closed ring: rounded, deduplicated, rotated so the smallest vertex comes first,
 * wound in the direction that gives the smaller vertex sequence, then closed again.
 */
function canonicalRing(ring: Position[]): Position[] {
  const open = roundLine(ring)
  const first = open[0]
  const last = open[open.length - 1]
  if (open.length > 1 && first !== undefined && last !== undefined && samePosition(first, last)) {
    open.pop()
  }
  if (open.length === 0) return []

  let start = 0
  for (let i = 1; i < open.length; i += 1) {
    if (compareCoords(open[i] as Position, open[start] as Position) < 0) start = i
  }
  const rotated = [...open.slice(start), ...open.slice(0, start)]
  const head = rotated[0] as Position
  // Keep the start vertex fixed and let the direction decide the rest of the sequence.
  const directed = [head, ...canonicalDirection(rotated.slice(1))]
  return [...directed, head]
}

function canonicalPolygon(rings: Position[][]): Position[][] {
  const [exterior, ...holes] = rings
  if (exterior === undefined) return []
  return [canonicalRing(exterior), ...holes.map(canonicalRing).sort(compareCoords)]
}

/**
 * The canonical form of a geometry: the same shape always yields deep-equal output.
 * The input is not mutated. Exported for tests and debugging; callers want `geomHash`.
 */
export function canonicalizeGeometry<G extends Geometry>(geometry: G): G {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: roundPosition(geometry.coordinates) } as G
    case 'MultiPoint':
      return {
        type: 'MultiPoint',
        coordinates: geometry.coordinates.map(roundPosition).sort(compareCoords),
      } as G
    case 'LineString':
      return { type: 'LineString', coordinates: canonicalLine(geometry.coordinates) } as G
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates.map(canonicalLine).sort(compareCoords),
      } as G
    case 'Polygon':
      return { type: 'Polygon', coordinates: canonicalPolygon(geometry.coordinates) } as G
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map(canonicalPolygon).sort(compareCoords),
      } as G
    case 'GeometryCollection':
      return {
        type: 'GeometryCollection',
        geometries: geometry.geometries
          .map((member) => canonicalizeGeometry(member))
          .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
      } as G
  }
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * sha256 (hex) of the canonical WKB of a geometry. Coordinates are expected in
 * EPSG:3067 metres; rounding to 1 cm is meaningless for degrees.
 */
export function geomHash(geometry: Geometry): string {
  const wkb = WkxGeometry.parseGeoJSON(canonicalizeGeometry(geometry)).toWkb()
  return sha256Hex(wkb)
}

/**
 * JSON.stringify with object keys sorted at every level, so key order does not
 * affect the output. Follows JSON semantics otherwise: `undefined` properties are
 * dropped, `undefined` array items become `null`, non-finite numbers become `null`,
 * `toJSON()` is honoured.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'toJSON' in value) {
    const toJSON = (value as { toJSON: unknown }).toJSON
    if (typeof toJSON === 'function') return sortKeysDeep(toJSON.call(value))
  }
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key]
      if (item !== undefined) sorted[key] = sortKeysDeep(item)
    }
    return sorted
  }
  return value
}

/** sha256 (hex) of the stable JSON form of an attribute object. */
export function attrHash(attributes: unknown): string {
  return sha256Hex(stableStringify(attributes))
}
