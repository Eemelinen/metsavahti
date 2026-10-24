import { readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CUTTING_TYPES, UNKNOWN_CUTTING_TYPE } from '@/config/cutting-types'
import { colors } from '@/lib/design-tokens'
import { geomHash } from '@/lib/geo/hash'
import { cuttingColourToken, cuttingType, cuttingTypeLabel } from '@/lib/wfs/codes'
import {
  normaliseFeature,
  normaliseFeatures,
  parseSourceDate,
  validUntilFor,
} from '@/lib/wfs/normalise'
import { parseFeatureCollection } from '@/lib/wfs/parse'
import type { DeclarationFeature } from '@/lib/wfs/schemas'
import { loadWfsFixture } from '../../helpers/wfs-fixture'

const FIXTURE_FILES = readdirSync(path.resolve(process.cwd(), 'tests/fixtures/wfs')).filter(
  (name) => name.endsWith('.json') && name !== 'manifest.json',
)

const fixtureFeatures = (): DeclarationFeature[] =>
  FIXTURE_FILES.flatMap((name) => parseFeatureCollection(loadWfsFixture(name)).features)

const sampleFeature = (): DeclarationFeature => {
  const [feature] = parseFeatureCollection(loadWfsFixture()).features
  return feature!
}

const withProperties = (
  feature: DeclarationFeature,
  properties: Partial<DeclarationFeature['properties']>,
): DeclarationFeature => ({ ...feature, properties: { ...feature.properties, ...properties } })

/** MV-024: `WfsFeature` → `NormalisedDeclaration`, cutting-type codes and Finnish labels. */
describe('normaliseFeature on the recorded fixtures', () => {
  it('covers every recorded fixture file', () => {
    expect(FIXTURE_FILES).toEqual(
      expect.arrayContaining(['inside.json', 'borderline.json', 'outside.json', 'paged-1.json']),
    )
    expect(fixtureFeatures().length).toBeGreaterThan(40)
  })

  it.each(FIXTURE_FILES)('normalises every feature of %s', (name) => {
    const collection = parseFeatureCollection(loadWfsFixture(name))
    const records = normaliseFeatures(collection)
    expect(records).toHaveLength(collection.features.length)

    collection.features.forEach((feature, i) => {
      const record = records[i]!
      const p = feature.properties
      expect(record.sourceId).toBe(feature.id)
      expect(record.declarationNumber).toBe(p.FORESTUSEDECLARATIONNUMBER)
      expect(record.cuttingTypeCode).toBe(p.CUTTINGREALIZATIONPRACTICE)
      expect(record.cuttingTypeLabel).toBe(cuttingTypeLabel(p.CUTTINGREALIZATIONPRACTICE))
      expect(record.areaHa).toBe(p.AREA)
      expect(record.receivedAt).toBe(new Date(p.DECLARATIONARRIVALDATE!).toISOString())
      expect(record.validUntil).toBe(validUntilFor(record.receivedAt!))
      expect(record.municipalityCode).toBeNull()
      expect(record.rawAttributes).toBe(p)
      expect(record.attrHash).toMatch(/^[0-9a-f]{64}$/)

      expect(record.geometry.type).toBe('MultiPolygon')
      const parts =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates
      expect(record.geometry.coordinates).toEqual(parts)
      expect(record.geomHash).toBe(geomHash(record.geometry))
    })
  })

  it('normalises the sample stand to known values', () => {
    const { geometry: _g, rawAttributes: _p, ...rest } = normaliseFeature(sampleFeature())
    expect(rest).toEqual({
      sourceId: 'forestusedeclaration.27613405',
      declarationNumber: '1-2025-111387',
      cuttingTypeCode: 5,
      cuttingTypeLabel: 'Avohakkuu',
      areaHa: 2.2216,
      receivedAt: '2025-10-28T13:30:18.000Z',
      validUntil: '2028-10-28T13:30:18.000Z',
      municipalityCode: null,
      geomHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      attrHash: '2d9df0776b7797aca3880d96646cfaa4a2fe9931d64d24604337113c4666b757',
    })
  })

  it('gives a Polygon and the same shape as a MultiPolygon the same geomHash', () => {
    const feature = sampleFeature()
    if (feature.geometry.type !== 'Polygon') throw new Error('the sample stand is a Polygon')
    const asMulti: DeclarationFeature = {
      ...feature,
      geometry: { type: 'MultiPolygon', coordinates: [feature.geometry.coordinates] },
    }
    expect(normaliseFeature(asMulti).geomHash).toBe(normaliseFeature(feature).geomHash)
  })

  it('has a known label for every cutting-type code in the fixtures', () => {
    const codes = new Set(fixtureFeatures().map((f) => f.properties.CUTTINGREALIZATIONPRACTICE))
    expect(codes.size).toBeGreaterThan(3)
    const unlabelled = [...codes].filter((code) => !cuttingType(code).known)
    expect(unlabelled).toEqual([])
  })
})

describe('cutting-type codes', () => {
  it('lists Metsäkeskus code list 1014 (codes 1–25) with a label, explanation, colour and severity', () => {
    expect(Object.keys(CUTTING_TYPES).map(Number)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    )
    for (const definition of Object.values(CUTTING_TYPES)) {
      expect(definition.label_fi.length).toBeGreaterThan(3)
      expect(definition.explanation_fi).toMatch(/^[A-ZÄÖ].{20,}\.$/)
      expect(definition.source_label_fi.length).toBeGreaterThan(3)
      expect(Object.keys(colors.cut)).toContain(definition.colourToken)
      expect(['low', 'medium', 'high']).toContain(definition.severity)
    }
  })

  it('maps the codes seen on the live layer, which the old table lacked', () => {
    expect(cuttingTypeLabel(12)).toBe('Poimintahakkuu')
    expect(cuttingTypeLabel(13)).toBe('Kasvatushakkuu')
    expect(cuttingTypeLabel(14)).toBe('Muu hakkuu')
    expect(cuttingTypeLabel(20)).toBe('Myrskytuhoalueen harvennus')
  })

  it('groups codes into the three map colours', () => {
    expect(cuttingType(5)).toMatchObject({
      label_fi: 'Avohakkuu',
      colourToken: 'uudistus',
      severity: 'high',
      known: true,
      code: 5,
    })
    expect(cuttingColourToken(8)).toBe('uudistus')
    expect(cuttingColourToken(3)).toBe('harvennus')
    expect(cuttingColourToken(2)).toBe('harvennus')
    expect(cuttingColourToken(1)).toBe('harvennus')
    expect(cuttingColourToken(9)).toBe('muu')
    expect(cuttingType(3).explanation_fi).toMatch(/^Osa puista poistetaan/)
  })

  it('falls back to muu for unknown and missing codes', () => {
    for (const code of [999, 0, -1, 2.5, null, undefined]) {
      expect(cuttingType(code)).toEqual({
        ...UNKNOWN_CUTTING_TYPE,
        code: code ?? null,
        known: false,
      })
      expect(cuttingColourToken(code)).toBe('muu')
    }
    expect(cuttingTypeLabel(999)).toBe('Muu hakkuu')
  })

  it('normalises a feature with an unknown or missing code to muu', () => {
    const unknown = normaliseFeature(
      withProperties(sampleFeature(), { CUTTINGREALIZATIONPRACTICE: 999 }),
    )
    expect(unknown.cuttingTypeCode).toBe(999)
    expect(unknown.cuttingTypeLabel).toBe('Muu hakkuu')

    const missing = normaliseFeature(
      withProperties(sampleFeature(), { CUTTINGREALIZATIONPRACTICE: null }),
    )
    expect(missing.cuttingTypeCode).toBeNull()
    expect(missing.cuttingTypeLabel).toBe('Muu hakkuu')
  })
})

describe('date parsing', () => {
  it('reads ISO 8601 with a Finnish summer or winter offset as UTC', () => {
    expect(parseSourceDate('2025-09-11T15:31:58+03:00')).toBe('2025-09-11T12:31:58.000Z')
    expect(parseSourceDate('2025-10-28T15:30:18+02:00')).toBe('2025-10-28T13:30:18.000Z')
    expect(parseSourceDate('2025-12-31T23:30:00+02:00')).toBe('2025-12-31T21:30:00.000Z')
    expect(parseSourceDate('2026-01-01T00:15:00+0200')).toBe('2025-12-31T22:15:00.000Z')
  })

  it('accepts UTC and fractional seconds', () => {
    expect(parseSourceDate('2026-04-28T08:42:52Z')).toBe('2026-04-28T08:42:52.000Z')
    expect(parseSourceDate('2026-04-28T08:42:52.25+03:00')).toBe('2026-04-28T05:42:52.250Z')
    expect(parseSourceDate(' 2026-04-28T08:42:52Z ')).toBe('2026-04-28T08:42:52.000Z')
  })

  it('reads a value without a zone as Finnish time, across the DST change', () => {
    expect(parseSourceDate('2026-01-15')).toBe('2026-01-14T22:00:00.000Z')
    expect(parseSourceDate('2026-07-01')).toBe('2026-06-30T21:00:00.000Z')
    // Summer time ends at 04:00 on Sunday 25 October 2026.
    expect(parseSourceDate('2026-10-25')).toBe('2026-10-24T21:00:00.000Z')
    expect(parseSourceDate('2026-10-26')).toBe('2026-10-25T22:00:00.000Z')
    expect(parseSourceDate('2025-09-11T15:31:58')).toBe('2025-09-11T12:31:58.000Z')
    expect(parseSourceDate('2025-02-11T15:31')).toBe('2025-02-11T13:31:00.000Z')
  })

  it('returns null for missing values and non-dates', () => {
    const values = [
      null,
      undefined,
      '',
      'not a date',
      '2025',
      '2025-02-30',
      '2025-13-01',
      '2025-09-11T25:00:00',
      '11.9.2025',
      '2025-09-11T15:31:58+25:00',
    ]
    expect(values.map((value) => [value, parseSourceDate(value)])).toEqual(
      values.map((value) => [value, null]),
    )
  })

  it('sets validUntil three years after receipt and keeps a leap day in February', () => {
    expect(validUntilFor('2026-03-01T00:00:00.000Z')).toBe('2029-03-01T00:00:00.000Z')
    expect(validUntilFor('2024-02-29T10:00:00.000Z')).toBe('2027-02-28T10:00:00.000Z')
    expect(validUntilFor(new Date('2025-12-31T21:30:00.000Z'))).toBe('2028-12-31T21:30:00.000Z')
  })

  it('falls back to the stand arrival date, and leaves both dates empty without one', () => {
    const standOnly = normaliseFeature(
      withProperties(sampleFeature(), {
        DECLARATIONARRIVALDATE: null,
        STANDARRIVALDATE: '2024-02-29T12:00:00+02:00',
      }),
    )
    expect(standOnly.receivedAt).toBe('2024-02-29T10:00:00.000Z')
    expect(standOnly.validUntil).toBe('2027-02-28T10:00:00.000Z')

    const none = normaliseFeature(
      withProperties(sampleFeature(), { DECLARATIONARRIVALDATE: null, STANDARRIVALDATE: null }),
    )
    expect(none.receivedAt).toBeNull()
    expect(none.validUntil).toBeNull()
  })
})
