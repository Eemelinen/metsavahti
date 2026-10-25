import { z } from 'zod'

/**
 * Input of the `acceptLegalDocuments` Server Action (MV-086): the documents and versions the
 * prompt showed. Browser-safe. It comes from the prompt's own props, not from typed fields, so
 * a malformed one is a bug or tampering and the parse throws.
 */
export const reacceptanceSchema = z.object({
  documents: z
    .array(z.object({ slug: z.enum(['terms', 'privacy']), version: z.string().min(1).max(100) }))
    .min(1)
    .max(2)
    .refine((docs) => new Set(docs.map((d) => d.slug)).size === docs.length),
})

export type ReacceptanceInput = z.infer<typeof reacceptanceSchema>
