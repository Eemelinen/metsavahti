/**
 * Record WFS responses into tests/fixtures/wfs for unit, integration and e2e tests (MV-021).
 *
 *   pnpm fixtures:record --bbox 402000,6690500,405000,6693500 --name my-box [--count 1000] [--start-index 0]
 *   pnpm fixtures:record --set
 *
 * `--bbox` writes one GetFeature page (the query the pipeline sends: in-force declarations
 * intersecting the EPSG:3067 box) to `<name>.json`. `--set` rebuilds the named set of
 * `05-conventions.md` around `SAMPLE_WATCH_AREA` and describes it in `manifest.json`:
 *
 * - `inside`, `borderline`, `outside`: the stands of the area's request box that lie in the
 *   circle, cross its edge, or miss it. Stands within `MIN_MARGIN_M` of a class boundary are
 *   left out so PostGIS's 32-gon buffer cannot move them to another class.
 * - `paged-1`, `paged-2`: the same box in two live pages, the second one shorter.
 * - `empty`: a live box at sea.
 * - `changed-geometry`, `changed-attributes`: `inside` with one stand edited (derived, since a
 *   real change cannot be recorded on demand).
 *
 * Coordinates are rounded to centimetres; the `links` and collection `bbox` members are
 * dropped (they describe the live query, not the fixture).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { bboxForWatchArea } from '../src/lib/geo/bbox'
import { type Bbox } from '../src/lib/geo/buffer'
import { buildGetFeatureUrl, inForceBboxFilter } from '../src/lib/wfs/client'
import { CUTTING_TYPE_FIELD, LAYER_NAME } from '../src/lib/wfs/layer'
import { parseFeatureCollection } from '../src/lib/wfs/parse'
import { SAMPLE_WATCH_AREA, SAMPLE_WATCH_AREA_CENTER_3067 } from '../tests/fixtures/sample-area'
import { type CircleRelation, fitToCircle } from '../tests/helpers/wfs-fixture'

/** Clearance (metres) a stand needs from the circle edge to get a class in the set. */
const MIN_MARGIN_M = 10
/** Eastward shift (metres) of the edited stand in `changed-geometry`. */
const GEOMETRY_SHIFT_M = 5
/** Gulf of Finland, ~40 km south of Helsinki: no declarations. */
const EMPTY_BBOX: Bbox = [380_000, 6_630_000, 382_000, 6_632_000]
/** Cutting method written into `changed-attributes` (4 = avohakkuu; 2 if it already was 4). */
const CHANGED_CUTTING_TYPE = 4

const { values } = parseArgs({
  options: {
    bbox: { type: 'string' },
    name: { type: 'string' },
    count: { type: 'string', default: '1000' },
    'start-index': { type: 'string', default: '0' },
    set: { type: 'boolean', default: false },
    url: {
      type: 'string',
      default: process.env.WFS_BASE_URL ?? 'https://avoin.metsakeskus.fi/rajapinnat/v1/ows/',
    },
    layer: { type: 'string', default: process.env.WFS_LAYER ?? LAYER_NAME },
  },
})

type RawFeature = {
  id: string
  bbox?: number[]
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}
type RawCollection = { features: RawFeature[]; numberReturned?: number } & Record<string, unknown>

const dir = path.resolve(process.cwd(), 'tests/fixtures/wfs')

function round(c: unknown): unknown {
  if (!Array.isArray(c)) return c
  if (typeof c[0] === 'number') return (c as number[]).map((n) => Math.round(n * 100) / 100)
  return c.map(round)
}

function shiftEast(c: unknown, dx: number): unknown {
  if (!Array.isArray(c)) return c
  if (typeof c[0] === 'number') return [(c[0] as number) + dx, ...c.slice(1)]
  return c.map((child) => shiftEast(child, dx))
}

async function getPage(bbox: Bbox, count: number, startIndex: number): Promise<RawCollection> {
  const url = buildGetFeatureUrl(
    { baseUrl: values.url, layer: values.layer },
    { bbox, count, startIndex },
  )
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`WFS responded ${res.status} for ${url}`)
  const raw = (await res.json()) as RawCollection
  // Fail before writing anything that the schema would reject.
  parseFeatureCollection(raw)
  const { links: _links, bbox: _bbox, ...collection } = raw
  for (const f of collection.features) {
    f.geometry.coordinates = round(f.geometry.coordinates)
    if (f.bbox) f.bbox = round(f.bbox) as number[]
  }
  return collection
}

function withFeatures(collection: RawCollection, features: RawFeature[]): RawCollection {
  return { ...collection, features, numberReturned: features.length }
}

function write(name: string, collection: RawCollection): void {
  parseFeatureCollection(collection)
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(collection, null, 2) + '\n')
  console.log(`Wrote ${collection.features.length} features to ${name}.json`)
}

async function recordSet(): Promise<void> {
  const { center, radiusM } = SAMPLE_WATCH_AREA
  const requestBbox = bboxForWatchArea([center.lng, center.lat], radiusM)
  const area = await getPage(requestBbox, 1000, 0)
  if (area.features.length >= 1000) throw new Error('sample box needs paging; pick a smaller area')
  // Two pages with a shorter, non-empty second one need at least three stands.
  if (area.features.length < 3) throw new Error('sample box has fewer than 3 stands; move the area')

  const byRelation: Record<CircleRelation, RawFeature[]> = {
    inside: [],
    borderline: [],
    outside: [],
  }
  const margins = new Map<string, number>()
  // In the box (and so in the pages) but in no class file; the manifest lists them.
  const skipped: string[] = []
  for (const feature of area.features) {
    const geometry = parseFeatureCollection(withFeatures(area, [feature])).features[0]!.geometry
    const { relation, marginM } = fitToCircle(geometry, SAMPLE_WATCH_AREA_CENTER_3067, radiusM)
    if (marginM < MIN_MARGIN_M) {
      console.warn(`Skipping ${feature.id}: ${relation} by only ${marginM.toFixed(1)} m`)
      skipped.push(feature.id)
      continue
    }
    byRelation[relation].push(feature)
    margins.set(feature.id, marginM)
  }
  for (const relation of ['inside', 'borderline', 'outside'] as const) {
    if (byRelation[relation].length === 0) throw new Error(`no ${relation} stands; move the area`)
    write(relation, withFeatures(area, byRelation[relation]))
  }

  const pageSize = Math.ceil((area.features.length + 1) / 2)
  const pages = [
    await getPage(requestBbox, pageSize, 0),
    await getPage(requestBbox, pageSize, pageSize),
  ]
  const pagedIds = pages.flatMap((page) => page.features.map((f) => f.id))
  const areaIds = area.features.map((f) => f.id)
  if (new Set(pagedIds).size !== pagedIds.length || pagedIds.length !== areaIds.length) {
    throw new Error('live pages overlap or miss stands; paging is not stable')
  }
  write('paged-1', pages[0]!)
  write('paged-2', pages[1]!)

  const empty = await getPage(EMPTY_BBOX, 1000, 0)
  if (empty.features.length > 0) throw new Error('the empty box is not empty any more')
  write('empty', empty)

  // Edit the inside stand with the most room, so the shifted copy stays inside.
  const inside = byRelation.inside
  const edited = inside.reduce((best, f) => (margins.get(f.id)! > margins.get(best.id)! ? f : best))
  if (margins.get(edited.id)! < MIN_MARGIN_M + GEOMETRY_SHIFT_M) {
    throw new Error(`no inside stand has room for a ${GEOMETRY_SHIFT_M} m shift`)
  }
  const replace = (next: RawFeature) => inside.map((f) => (f.id === edited.id ? next : f))
  const geometryEdit = structuredClone(edited)
  geometryEdit.geometry.coordinates = round(
    shiftEast(edited.geometry.coordinates, GEOMETRY_SHIFT_M),
  )
  // Feature bbox is [minE, minN, maxE, maxN]: both eastings move.
  geometryEdit.bbox = geometryEdit.bbox?.map((v, i) => (i % 2 === 0 ? v + GEOMETRY_SHIFT_M : v))
  write('changed-geometry', withFeatures(area, replace(geometryEdit)))

  const previousCuttingType = edited.properties[CUTTING_TYPE_FIELD]
  const cuttingType = previousCuttingType === CHANGED_CUTTING_TYPE ? 2 : CHANGED_CUTTING_TYPE
  const attributeEdit = structuredClone(edited)
  attributeEdit.properties[CUTTING_TYPE_FIELD] = cuttingType
  write('changed-attributes', withFeatures(area, replace(attributeEdit)))

  const ids = (features: RawFeature[]) => features.map((f) => f.id)
  const manifest = {
    recordedAt: new Date().toISOString(),
    source: { url: values.url, layer: values.layer },
    sampleArea: { ...SAMPLE_WATCH_AREA, center3067: round(SAMPLE_WATCH_AREA_CENTER_3067) },
    requestBbox: round(requestBbox),
    filter: inForceBboxFilter(requestBbox),
    minMarginM: MIN_MARGIN_M,
    skipped,
    fixtures: {
      inside: { ids: ids(byRelation.inside) },
      borderline: { ids: ids(byRelation.borderline) },
      outside: { ids: ids(byRelation.outside) },
      'paged-1': { count: pageSize, startIndex: 0, ids: ids(pages[0]!.features) },
      'paged-2': { count: pageSize, startIndex: pageSize, ids: ids(pages[1]!.features) },
      empty: { bbox: EMPTY_BBOX, ids: [] },
      'changed-geometry': {
        derivedFrom: 'inside',
        changedId: edited.id,
        change: `geometry shifted ${GEOMETRY_SHIFT_M} m east`,
      },
      'changed-attributes': {
        derivedFrom: 'inside',
        changedId: edited.id,
        change: `${CUTTING_TYPE_FIELD} ${String(previousCuttingType)} → ${cuttingType}`,
      },
    },
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log('Wrote manifest.json')
}

async function recordPage(): Promise<void> {
  if (!values.bbox || !values.name) throw new Error('--bbox and --name are required (or --set)')
  const bbox = values.bbox.split(',').map(Number) as Bbox
  if (bbox.length !== 4 || bbox.some(Number.isNaN)) throw new Error(`bad --bbox ${values.bbox}`)
  write(values.name, await getPage(bbox, Number(values.count), Number(values['start-index'])))
}

async function main() {
  mkdirSync(dir, { recursive: true })
  await (values.set ? recordSet() : recordPage())
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
