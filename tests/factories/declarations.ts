import { attrHash, geomHash } from '@/lib/geo/hash'
import type { EastNorth } from '@/lib/geo/crs'
import { cuttingType } from '@/lib/wfs/codes'
import {
  type DeclarationMultiPolygon,
  type NormalisedDeclaration,
  normaliseFeatures,
  validUntilFor,
} from '@/lib/wfs/normalise'
import { loadWfsFixture } from '../helpers/wfs-fixture'

/** Named sets of the recorded fixture (`tests/fixtures/wfs/manifest.json`). */
export type FixtureSet =
  'inside' | 'borderline' | 'outside' | 'changed-geometry' | 'changed-attributes'

/** One named fixture set, normalised exactly as the pipeline does (`normaliseFeatures()`). */
export function fixtureDeclarations(set: FixtureSet): NormalisedDeclaration[] {
  return normaliseFeatures(loadWfsFixture(`${set}.json`))
}

/** An axis-aligned square MultiPolygon in EPSG:3067 centred on `center`. */
export function squareMultiPolygon(center: EastNorth, halfSideM: number): DeclarationMultiPolygon {
  const [e, n] = center
  return {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [e - halfSideM, n - halfSideM],
          [e + halfSideM, n - halfSideM],
          [e + halfSideM, n + halfSideM],
          [e - halfSideM, n + halfSideM],
          [e - halfSideM, n - halfSideM],
        ],
      ],
    ],
  }
}

export type DeclarationOverrides = Partial<
  Pick<NormalisedDeclaration, 'declarationNumber' | 'cuttingTypeCode' | 'areaHa' | 'receivedAt'>
> & { geometry?: DeclarationMultiPolygon }

/**
 * A `NormalisedDeclaration` for a hand-made geometry (default: a 100 m square at
 * `center`), with hashes and derived fields computed the way `normaliseFeature()` does.
 */
export function buildDeclaration(
  sourceId: string,
  center: EastNorth,
  overrides: DeclarationOverrides = {},
): NormalisedDeclaration {
  const geometry = overrides.geometry ?? squareMultiPolygon(center, 50)
  const cuttingTypeCode = overrides.cuttingTypeCode ?? 3
  const receivedAt = overrides.receivedAt ?? '2026-06-01T09:00:00.000Z'
  const rawAttributes = {
    FORESTUSEDECLARATIONNUMBER: overrides.declarationNumber ?? `F-${sourceId}`,
    CUTTINGREALIZATIONPRACTICE: cuttingTypeCode,
    AREA: overrides.areaHa ?? 1.5,
    DECLARATIONARRIVALDATE: receivedAt,
  } as unknown as NormalisedDeclaration['rawAttributes']
  return {
    sourceId,
    declarationNumber: overrides.declarationNumber ?? `F-${sourceId}`,
    cuttingTypeCode,
    cuttingTypeLabel: cuttingType(cuttingTypeCode).label_fi,
    areaHa: overrides.areaHa ?? 1.5,
    receivedAt,
    validUntil: receivedAt == null ? null : validUntilFor(receivedAt),
    municipalityCode: null,
    geometry,
    geomHash: geomHash(geometry),
    attrHash: attrHash(rawAttributes),
    rawAttributes,
  }
}
