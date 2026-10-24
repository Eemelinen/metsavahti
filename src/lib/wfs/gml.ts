import { XMLParser } from 'fast-xml-parser'

import { GEOMETRY_FIELD, LAYER_ATTRIBUTES, type LayerAttributeType } from '@/lib/wfs/layer'

/**
 * GML fallback of the WFS client (`01 §4`: "fall back to GML via `fast-xml-parser` only if
 * JSON is refused"). Turns a GeoServer WFS 2.0 `wfs:FeatureCollection` (GML 3.2) into the
 * GeoJSON shape the JSON output has, so both paths go through the same Zod schema and give
 * the same `attrHash`: attributes are typed from `LAYER_ATTRIBUTES`, and every pinned
 * attribute is present, `null` when the element is nil or missing (the JSON output sends
 * them all). Axis order needs no swap: EPSG:3067 is easting, northing.
 */

const ARRAY_ELEMENTS = new Set([
  'member',
  'featureMember',
  'surfaceMember',
  'polygonMember',
  'interior',
  'pos',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => ARRAY_ELEMENTS.has(name),
})

type XmlNode = Record<string, unknown>

export class GmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GmlParseError'
  }
}

function isNode(value: unknown): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Child elements of a node (attributes and text left out). */
function children(node: XmlNode): [string, unknown][] {
  return Object.entries(node).filter(([key]) => !key.startsWith('@_') && key !== '#text')
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (isNode(value)) {
    if (value['@_nil'] === 'true') return null
    if (typeof value['#text'] === 'string') return value['#text']
  }
  return null
}

function attributeValue(value: unknown, type: LayerAttributeType | undefined): unknown {
  const raw = text(value)
  if (raw === null || raw === '') return null
  if (type === 'decimal') {
    const n = Number(raw)
    // Leave a non-number as it is, so the schema names the attribute that drifted.
    return Number.isNaN(n) ? raw : n
  }
  return raw
}

function positions(list: string, dimension: number): number[][] {
  const numbers = list.trim().split(/\s+/).map(Number)
  if (numbers.some((n) => Number.isNaN(n)) || numbers.length % dimension !== 0) {
    throw new GmlParseError(`malformed coordinate list (${dimension}D)`)
  }
  const result: number[][] = []
  for (let i = 0; i < numbers.length; i += dimension) {
    result.push(numbers.slice(i, i + Math.min(dimension, 3)))
  }
  return result
}

function dimensionOf(node: XmlNode, fallback: number): number {
  const value = Number(node['@_srsDimension'])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function ringCoordinates(boundary: unknown, dimension: number): number[][] {
  const ring = isNode(boundary) ? boundary.LinearRing : undefined
  if (!isNode(ring)) throw new GmlParseError('polygon boundary without gml:LinearRing')
  if (ring.posList !== undefined) {
    const list = ring.posList
    const listText = text(list)
    if (listText === null) throw new GmlParseError('empty gml:posList')
    return positions(listText, isNode(list) ? dimensionOf(list, dimension) : dimension)
  }
  if (Array.isArray(ring.pos)) {
    return ring.pos.map((pos) => {
      const posText = text(pos)
      if (posText === null) throw new GmlParseError('empty gml:pos')
      return positions(posText, isNode(pos) ? dimensionOf(pos, dimension) : dimension)[0]!
    })
  }
  throw new GmlParseError('gml:LinearRing without gml:posList or gml:pos')
}

function polygonCoordinates(polygon: unknown, dimension: number): number[][][] {
  if (!isNode(polygon)) throw new GmlParseError('empty gml:Polygon')
  const own = dimensionOf(polygon, dimension)
  const interiors = Array.isArray(polygon.interior) ? polygon.interior : []
  return [
    ringCoordinates(polygon.exterior, own),
    ...interiors.map((ring) => ringCoordinates(ring, own)),
  ]
}

type GmlGeometry = {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  srsName: string | null
}

function geometry(property: unknown): GmlGeometry | null {
  if (!isNode(property)) return null
  const [entry] = children(property)
  if (!entry) return null
  const [kind, node] = entry
  if (!isNode(node)) throw new GmlParseError(`empty gml:${kind}`)
  const srsName = typeof node['@_srsName'] === 'string' ? node['@_srsName'] : null
  const dimension = dimensionOf(node, 2)
  if (kind === 'Polygon') {
    return {
      geometry: { type: 'Polygon', coordinates: polygonCoordinates(node, dimension) },
      srsName,
    }
  }
  if (kind === 'MultiSurface' || kind === 'MultiPolygon') {
    const members = (kind === 'MultiSurface' ? node.surfaceMember : node.polygonMember) ?? []
    const polygons = (members as unknown[]).map((member) => {
      const inner = isNode(member) ? member.Polygon : undefined
      if (inner === undefined) throw new GmlParseError(`gml:${kind} member is not a gml:Polygon`)
      return polygonCoordinates(inner, dimension)
    })
    return { geometry: { type: 'MultiPolygon', coordinates: polygons }, srsName }
  }
  throw new GmlParseError(`unsupported geometry gml:${kind}`)
}

function feature(member: unknown): { value: unknown; srsName: string | null } {
  const [entry] = isNode(member) ? children(member) : []
  if (!entry || !isNode(entry[1])) throw new GmlParseError('wfs:member without a feature')
  const node = entry[1]
  const properties: Record<string, unknown> = Object.fromEntries(
    Object.keys(LAYER_ATTRIBUTES).map((name) => [name, null]),
  )
  for (const [name, value] of children(node)) {
    if (name === GEOMETRY_FIELD) continue
    properties[name] = attributeValue(
      value,
      (LAYER_ATTRIBUTES as Record<string, LayerAttributeType>)[name],
    )
  }
  const parsed = geometry(node[GEOMETRY_FIELD])
  return {
    value: {
      type: 'Feature',
      id: node['@_id'],
      geometry: parsed?.geometry ?? null,
      properties,
    },
    srsName: parsed?.srsName ?? null,
  }
}

function optionalNumber(value: unknown): number | undefined {
  const n = Number(value)
  return value === undefined || Number.isNaN(n) ? undefined : n
}

/**
 * GeoJSON-shaped object of a GML `wfs:FeatureCollection` (or a WFS 1.1
 * `gml:featureMember` list); still unvalidated, `parseFeatureCollection()` checks it.
 * Throws `GmlParseError` for an `ows:ExceptionReport` or anything that is not one.
 */
export function gmlToFeatureCollection(xml: string): unknown {
  let document: XmlNode
  try {
    document = parser.parse(xml) as XmlNode
  } catch (error) {
    throw new GmlParseError(
      `invalid XML: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const report = document.ExceptionReport
  if (report !== undefined) throw new GmlParseError(`WFS exception: ${exceptionText(report)}`)
  const collection = document.FeatureCollection
  if (collection === undefined) throw new GmlParseError('not a wfs:FeatureCollection')
  const node = isNode(collection) ? collection : {}
  const members = [
    ...((node.member as unknown[] | undefined) ?? []),
    ...((node.featureMember as unknown[] | undefined) ?? []),
  ]
  const features = members.map(feature)
  const srsName = features.find((f) => f.srsName)?.srsName ?? null
  const matched = node['@_numberMatched']
  return {
    type: 'FeatureCollection',
    features: features.map((f) => f.value),
    numberReturned: optionalNumber(node['@_numberReturned']) ?? features.length,
    totalFeatures: optionalNumber(matched) ?? (typeof matched === 'string' ? matched : undefined),
    timeStamp: typeof node['@_timeStamp'] === 'string' ? node['@_timeStamp'] : undefined,
    crs: srsName ? { type: 'name', properties: { name: srsName } } : null,
  }
}

function exceptionText(report: unknown): string {
  const exception = isNode(report) ? report.Exception : undefined
  if (!isNode(exception)) return 'unknown'
  const code = typeof exception['@_exceptionCode'] === 'string' ? exception['@_exceptionCode'] : ''
  const locator = typeof exception['@_locator'] === 'string' ? ` at ${exception['@_locator']}` : ''
  const message = text(exception.ExceptionText)?.trim() ?? ''
  return `${code}${locator}${message ? `: ${message}` : ''}` || 'unknown'
}

/** Whether an OWS exception body says the requested `outputFormat` is not supported. */
export function refusesOutputFormat(body: string): boolean {
  return /locator="outputFormat"|output ?format/i.test(body) && /Exception/.test(body)
}
