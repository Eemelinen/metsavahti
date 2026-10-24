import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { attrHash, geomHash } from '@/lib/geo/hash'
import {
  attributeDrift,
  capabilitiesConstraint,
  findLayer,
  parseDescribeFeatureType,
} from '@/lib/wfs/describe'
import {
  FEATURE_ID_PREFIX,
  GEOMETRY_FIELD,
  LAYER_ATTRIBUTES,
  LAYER_COUNT_DEFAULT,
  LAYER_DEFAULT_CRS,
  LAYER_NAME,
  VALID_NOW_FIELD,
} from '@/lib/wfs/layer'
import { parseFeatureCollection } from '@/lib/wfs/parse'
import { type DeclarationFeatureCollection, WfsFeatureSchema } from '@/lib/wfs/schemas'
import { SAMPLE_WATCH_AREA, SAMPLE_WATCH_AREA_CENTER_3067 } from '../../fixtures/sample-area'
import { fitToCircle, loadWfsFixture } from '../../helpers/wfs-fixture'

/**
 * MV-021: the pinned layer contract (`layer.ts`, `schemas.ts`) against the recorded discovery
 * documents and the named fixture set. The live counterpart is `wfs-contract.live.test.ts`.
 */

const dir = path.resolve(process.cwd(), 'tests/fixtures/wfs')
const read = (name: string) => readFileSync(path.join(dir, name), 'utf8')

type Manifest = {
  minMarginM: number
  /** Stands of the box too close to a class boundary for any class file. */
  skipped: string[]
  fixtures: Record<string, { ids?: string[]; count?: number; changedId?: string }>
}
const manifest = JSON.parse(read('manifest.json')) as Manifest

const NAMED_SET = [
  'inside',
  'outside',
  'borderline',
  'changed-geometry',
  'changed-attributes',
  'empty',
  'paged-1',
  'paged-2',
] as const

const load = (name: string): DeclarationFeatureCollection =>
  parseFeatureCollection(loadWfsFixture(`${name}.json`))
const ids = (fc: DeclarationFeatureCollection) => fc.features.map((f) => f.id)

describe('WFS layer contract (recorded 2026-10-24)', () => {
  it('describe.xml has exactly the pinned attributes and types', () => {
    const described = parseDescribeFeatureType(read('describe.xml'))
    expect(described.find(({ name }) => name === GEOMETRY_FIELD)?.type).toBe('SurfacePropertyType')
    expect(attributeDrift(described)).toEqual({ added: [], removed: [], retyped: [] })
    expect(described.map(({ name }) => name).filter((name) => name !== GEOMETRY_FIELD)).toEqual(
      Object.keys(LAYER_ATTRIBUTES),
    )
  })

  it('capabilities.xml advertises the layer in EPSG:3067 with paging and JSON output', () => {
    const capabilities = read('capabilities.xml')
    expect(findLayer(capabilities, LAYER_NAME)).toMatchObject({
      name: LAYER_NAME,
      defaultCrs: LAYER_DEFAULT_CRS,
    })
    expect(capabilitiesConstraint(capabilities, 'CountDefault')).toBe(String(LAYER_COUNT_DEFAULT))
    expect(capabilitiesConstraint(capabilities, 'ImplementsResultPaging')).toBe('TRUE')
    expect(capabilities).toContain('application/json')
  })

  it('every recorded fixture parses, and every feature is a stand in force with all attributes', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    expect(files).toEqual(expect.arrayContaining(NAMED_SET.map((name) => `${name}.json`)))
    for (const file of files) {
      const fc = parseFeatureCollection(loadWfsFixture(file))
      for (const feature of fc.features) {
        expect(WfsFeatureSchema.safeParse(feature).success).toBe(true)
        expect(feature.id.startsWith(FEATURE_ID_PREFIX)).toBe(true)
        expect(feature.properties[VALID_NOW_FIELD]).toBe(1)
        expect(Object.keys(feature.properties)).toEqual(
          expect.arrayContaining(Object.keys(LAYER_ATTRIBUTES)),
        )
      }
    }
  })

  it('stays under the 2 MB fixture budget', () => {
    const bytes = readdirSync(dir).reduce((sum, f) => sum + statSync(path.join(dir, f)).size, 0)
    expect(bytes).toBeLessThan(2 * 1024 * 1024)
  })

  it('rejects a feature whose attributes drift from the pinned types', () => {
    const [feature] = load('inside').features
    const retyped = { ...feature, properties: { ...feature!.properties, AREA: '1,5' } }
    expect(WfsFeatureSchema.safeParse(retyped).success).toBe(false)
    const badDate = { ...feature, properties: { ...feature!.properties, UPDATETIME: '24.10.2026' } }
    expect(WfsFeatureSchema.safeParse(badDate).success).toBe(false)
  })
})

describe('named fixture set around SAMPLE_WATCH_AREA', () => {
  const { radiusM } = SAMPLE_WATCH_AREA

  it.each(['inside', 'borderline', 'outside'] as const)(
    '%s holds only stands of that class, clear of the edge',
    (relation) => {
      const fc = load(relation)
      expect(fc.features.length).toBeGreaterThan(0)
      expect(ids(fc)).toEqual(manifest.fixtures[relation]!.ids)
      for (const feature of fc.features) {
        const fit = fitToCircle(feature.geometry, SAMPLE_WATCH_AREA_CENTER_3067, radiusM)
        expect(fit.relation).toBe(relation)
        expect(fit.marginM).toBeGreaterThanOrEqual(manifest.minMarginM)
      }
    },
  )

  it('paged-1 is a full page and paged-2 the shorter rest of the same box', () => {
    const [first, second] = [load('paged-1'), load('paged-2')]
    const count = manifest.fixtures['paged-1']!.count!
    expect(first.features).toHaveLength(count)
    expect(second.features.length).toBeGreaterThan(0)
    expect(second.features.length).toBeLessThan(count)

    const paged = [...ids(first), ...ids(second)]
    expect(new Set(paged).size).toBe(paged.length)
    const classified = ['inside', 'borderline', 'outside'].flatMap((name) => ids(load(name)))
    expect([...paged].sort()).toEqual([...classified, ...manifest.skipped].sort())
  })

  it('empty is a live response without features', () => {
    const fc = load('empty')
    expect(fc.features).toEqual([])
    expect(fc.numberReturned).toBe(0)
  })

  it.each([
    ['changed-geometry', { geometry: true, attributes: false }],
    ['changed-attributes', { geometry: false, attributes: true }],
  ] as const)('%s changes exactly one inside stand', (name, changed) => {
    const before = new Map(load('inside').features.map((f) => [f.id, f]))
    const after = load(name)
    expect(ids(after)).toEqual([...before.keys()])

    const differing = after.features.filter((f) => {
      const prev = before.get(f.id)!
      return (
        geomHash(f.geometry) !== geomHash(prev.geometry) ||
        attrHash(f.properties) !== attrHash(prev.properties)
      )
    })
    expect(differing.map((f) => f.id)).toEqual([manifest.fixtures[name]!.changedId])

    const [edited] = differing
    const prev = before.get(edited!.id)!
    expect(geomHash(edited!.geometry) !== geomHash(prev.geometry)).toBe(changed.geometry)
    expect(attrHash(edited!.properties) !== attrHash(prev.properties)).toBe(changed.attributes)
    const fit = fitToCircle(edited!.geometry, SAMPLE_WATCH_AREA_CENTER_3067, radiusM)
    expect(fit.relation).toBe('inside')
  })
})
