import {
  CUTTING_TYPES,
  type CuttingColourToken,
  type CuttingTypeDefinition,
  UNKNOWN_CUTTING_TYPE,
} from '@/config/cutting-types'

/** A cutting method as the UI and emails show it; `known` is false for the `muu` fallback. */
export type CuttingType = CuttingTypeDefinition & { code: number | null; known: boolean }

/**
 * `CUTTINGREALIZATIONPRACTICE` code → label, explanation, colour token and severity from
 * `src/config/cutting-types.ts`. `null`, `undefined` and codes outside the list fall back
 * to the `muu` entry (the raw code stays in `cuttingTypeCode` / `rawAttributes`).
 */
export function cuttingType(code: number | null | undefined): CuttingType {
  const definition = code == null ? undefined : CUTTING_TYPES[code]
  if (definition) return { ...definition, code: code ?? null, known: true }
  return { ...UNKNOWN_CUTTING_TYPE, code: code ?? null, known: false }
}

export function cuttingTypeLabel(code: number | null | undefined): string {
  return cuttingType(code).label_fi
}

/** `cut` colour token of a code: `harvennus`, `uudistus` or `muu` (`docs/design`). */
export function cuttingColourToken(code: number | null | undefined): CuttingColourToken {
  return cuttingType(code).colourToken
}
