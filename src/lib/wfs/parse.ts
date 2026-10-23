import { attrHash, geomHash } from '@/lib/geo/hash'
import {
  type DeclarationFeature,
  type DeclarationFeatureCollection,
  type DeclarationGeometry,
  declarationFeatureCollectionSchema,
} from '@/lib/wfs/schemas'

/** Normalised declaration ready to be stored in the `declarations` collection. */
export type DeclarationRecord = {
  sourceId: string
  declarationNumber: string
  cuttingTypeCode: number | null
  areaHa: number | null
  receivedAt: string | null
  geometry: DeclarationGeometry
  geomHash: string
  attrHash: string
  rawAttributes: DeclarationFeature['properties']
}

/** Parse and validate a raw WFS JSON body. Throws a ZodError on contract drift. */
export function parseFeatureCollection(raw: unknown): DeclarationFeatureCollection {
  return declarationFeatureCollectionSchema.parse(raw)
}

export function toDeclarationRecord(feature: DeclarationFeature): DeclarationRecord {
  const p = feature.properties
  return {
    sourceId: feature.id,
    declarationNumber: p.FORESTUSEDECLARATIONNUMBER,
    cuttingTypeCode: p.CUTTINGREALIZATIONPRACTICE ?? null,
    areaHa: p.AREA ?? null,
    receivedAt: p.DECLARATIONARRIVALDATE ?? null,
    geometry: feature.geometry,
    geomHash: geomHash(feature.geometry),
    attrHash: attrHash(p),
    rawAttributes: p,
  }
}

export function toDeclarationRecords(
  collection: DeclarationFeatureCollection,
): DeclarationRecord[] {
  return collection.features.map(toDeclarationRecord)
}
