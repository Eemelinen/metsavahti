import { GEOMETRY_FIELD, LAYER_ATTRIBUTES } from '@/lib/wfs/layer'

/**
 * Readers for the WFS discovery documents (`GetCapabilities`, `DescribeFeatureType`), used
 * by `pnpm wfs:describe` and the contract tests to compare the service with `layer.ts`.
 * GeoServer's XML is regular enough for patterns; nothing in the request path parses XML.
 */

export type DescribedAttribute = {
  name: string
  /** XSD type without its prefix: `string`, `decimal`, `dateTime`, `SurfacePropertyType` … */
  type: string
  documentation: string | null
}

const elementPattern = /<xsd:element\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xsd:element>)/g

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null
}

/** The properties of the feature type, in schema order (the geometry included). */
export function parseDescribeFeatureType(xsd: string): DescribedAttribute[] {
  const sequence = /<xsd:sequence>([\s\S]*?)<\/xsd:sequence>/.exec(xsd)?.[1] ?? ''
  return [...sequence.matchAll(elementPattern)].map(([, tag = '', body = '']) => ({
    name: attribute(tag, 'name') ?? '',
    type: (attribute(tag, 'type') ?? '').replace(/^\w+:/, ''),
    documentation:
      /<xsd:documentation>([\s\S]*?)<\/xsd:documentation>/.exec(body)?.[1]?.trim() ?? null,
  }))
}

export type LayerSummary = {
  name: string
  title: string | null
  defaultCrs: string | null
  /** WGS 84 bounds `[minLon, minLat, maxLon, maxLat]` */
  wgs84Bbox: [number, number, number, number] | null
}

/** The `FeatureType` entry of `layer` in a `GetCapabilities` document, or null. */
export function findLayer(capabilitiesXml: string, layer: string): LayerSummary | null {
  const escaped = layer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const entry = new RegExp(
    `<FeatureType\\b[^>]*>\\s*<Name>${escaped}</Name>([\\s\\S]*?)</FeatureType>`,
  ).exec(capabilitiesXml)?.[1]
  if (entry === undefined) return null
  const text = (tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(entry)?.[1] ?? null
  const corner = (tag: string) => text(tag)?.trim().split(/\s+/).map(Number)
  const lower = corner('ows:LowerCorner')
  const upper = corner('ows:UpperCorner')
  return {
    name: layer,
    title: text('Title'),
    defaultCrs: text('DefaultCRS'),
    wgs84Bbox:
      lower?.length === 2 && upper?.length === 2
        ? [lower[0]!, lower[1]!, upper[0]!, upper[1]!]
        : null,
  }
}

/** Value of a service-wide `ows:Constraint` such as `CountDefault`. */
export function capabilitiesConstraint(capabilitiesXml: string, name: string): string | null {
  return (
    new RegExp(
      `<ows:Constraint name="${name}">[\\s\\S]*?<ows:DefaultValue>([^<]*)</ows:DefaultValue>`,
    ).exec(capabilitiesXml)?.[1] ?? null
  )
}

export type AttributeDrift = {
  /** Attributes the service has and `LAYER_ATTRIBUTES` does not. */
  added: string[]
  /** Attributes in `LAYER_ATTRIBUTES` the service no longer has. */
  removed: string[]
  /** Attributes whose XSD type differs: `NAME: pinned → described`. */
  retyped: string[]
}

/** Differences between a described feature type and the pinned `LAYER_ATTRIBUTES`. */
export function attributeDrift(described: DescribedAttribute[]): AttributeDrift {
  const pinned = new Map<string, string>(Object.entries(LAYER_ATTRIBUTES))
  const actual = new Map(
    described.filter(({ name }) => name !== GEOMETRY_FIELD).map(({ name, type }) => [name, type]),
  )
  return {
    added: [...actual.keys()].filter((name) => !pinned.has(name)),
    removed: [...pinned.keys()].filter((name) => !actual.has(name)),
    retyped: [...actual]
      .filter(([name, type]) => pinned.has(name) && pinned.get(name) !== type)
      .map(([name, type]) => `${name}: ${pinned.get(name)} → ${type}`),
  }
}
