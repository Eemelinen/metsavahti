import {
  type DeclarationFeatureCollection,
  declarationFeatureCollectionSchema,
} from '@/lib/wfs/schemas'

/** Parse and validate a raw WFS JSON body. Throws a ZodError on contract drift. */
export function parseFeatureCollection(raw: unknown): DeclarationFeatureCollection {
  return declarationFeatureCollectionSchema.parse(raw)
}
