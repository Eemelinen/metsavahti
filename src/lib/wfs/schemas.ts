import { z } from 'zod'

import { type LayerAttributeType, LAYER_ATTRIBUTES } from '@/lib/wfs/layer'

/**
 * Zod schemas for the Metsäkeskus WFS `v1:forestusedeclaration` layer
 * (GetFeature with outputFormat=application/json, EPSG:3067).
 * Field names are the WFS attribute names verbatim; the list and the types come from the
 * pinned contract in `layer.ts` (DescribeFeatureType, 2026-10-24).
 */

const position = z.tuple([z.number(), z.number()]).rest(z.number())
const ring = z.array(position).min(4)

export const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(ring).min(1),
})

export const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(ring).min(1)).min(1),
})

export const declarationGeometrySchema = z.discriminatedUnion('type', [
  polygonGeometrySchema,
  multiPolygonGeometrySchema,
])

const attributeSchemas = {
  string: z.string().nullable().optional(),
  decimal: z.number().nullable().optional(),
  // e.g. "2026-06-05T11:39:34+03:00"
  dateTime: z.iso.datetime({ offset: true }).nullable().optional(),
} satisfies Record<LayerAttributeType, z.ZodType>

type LayerAttributeShape = {
  [K in keyof typeof LAYER_ATTRIBUTES]: (typeof attributeSchemas)[(typeof LAYER_ATTRIBUTES)[K]]
}

const layerAttributeShape = Object.fromEntries(
  Object.entries(LAYER_ATTRIBUTES).map(([name, type]) => [name, attributeSchemas[type]]),
) as LayerAttributeShape

/**
 * Every attribute of the layer, all nullable as in the XSD, except the declaration number,
 * which every feature carries. Unknown attributes pass through (`loose`): a column the
 * source adds must not stop the pipeline; the live contract test reports it instead.
 */
export const declarationPropertiesSchema = z
  .object(layerAttributeShape)
  .extend({ FORESTUSEDECLARATIONNUMBER: z.string() })
  .loose()

/** One stand of a forest-use declaration, as `GetFeature` returns it (`01 §4.1`). */
export const WfsFeatureSchema = z.object({
  type: z.literal('Feature'),
  /** e.g. "forestusedeclaration.27613405" — unique per stand */
  id: z.string().min(1),
  geometry: declarationGeometrySchema,
  properties: declarationPropertiesSchema,
})

export const declarationFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(WfsFeatureSchema),
  numberReturned: z.number().optional(),
  totalFeatures: z.union([z.number(), z.string()]).optional(),
  timeStamp: z.string().optional(),
  // GeoServer sends `"crs": null` when no feature matched (`empty.json`).
  crs: z
    .object({ type: z.string(), properties: z.object({ name: z.string() }) })
    .nullable()
    .optional(),
})

export type DeclarationGeometry = z.infer<typeof declarationGeometrySchema>
export type DeclarationFeature = z.infer<typeof WfsFeatureSchema>
export type DeclarationFeatureCollection = z.infer<typeof declarationFeatureCollectionSchema>
