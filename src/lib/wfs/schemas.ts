import { z } from 'zod'

/**
 * Zod schemas for the Metsäkeskus WFS `v1:forestusedeclaration` layer
 * (GetFeature with outputFormat=application/json, EPSG:3067).
 * Field names are the WFS attribute names verbatim (see DescribeFeatureType).
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

const nullableNumber = z.number().nullable().optional()
const nullableString = z.string().nullable().optional()

export const declarationPropertiesSchema = z
  .object({
    FORESTUSEDECLARATIONNUMBER: z.string(),
    DECLARATIONREFERENCE: nullableString,
    PROCESSINGAREANUMBER: nullableNumber,
    DECLARATIONSTATE: nullableString,
    VALID_NOW: nullableNumber,
    STANDNUMBER: nullableNumber,
    STANDNUMBEREXTENSION: nullableNumber,
    AREA: nullableNumber,
    MAINGROUP: nullableNumber,
    SUBGROUP: nullableNumber,
    DECLARATIONDEVELOPMENTCLASS: nullableNumber,
    DECLARATIONMAINTREESPECIES: nullableNumber,
    MEANAGE: nullableNumber,
    MEANDIAMETER: nullableNumber,
    CUTTINGPURPOSE: nullableNumber,
    CUTTINGREALIZATIONPRACTICE: nullableNumber,
    REGENERATIONCOMMITMENT: nullableNumber,
    DECLARATIONARRIVALDATE: nullableString,
    DECLARATIONARRIVALYEAR: nullableString,
    STANDARRIVALDATE: nullableString,
    CREATIONTIME: nullableString,
    UPDATETIME: nullableString,
  })
  .loose()

export const declarationFeatureSchema = z.object({
  type: z.literal('Feature'),
  /** e.g. "forestusedeclaration.27613405" — unique per stand */
  id: z.string().min(1),
  geometry: declarationGeometrySchema,
  properties: declarationPropertiesSchema,
})

export const declarationFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(declarationFeatureSchema),
  numberReturned: z.number().optional(),
  totalFeatures: z.union([z.number(), z.string()]).optional(),
  timeStamp: z.string().optional(),
  crs: z.object({ type: z.string(), properties: z.object({ name: z.string() }) }).optional(),
})

export type DeclarationGeometry = z.infer<typeof declarationGeometrySchema>
export type DeclarationFeature = z.infer<typeof declarationFeatureSchema>
export type DeclarationFeatureCollection = z.infer<typeof declarationFeatureCollectionSchema>
