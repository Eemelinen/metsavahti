/**
 * Record a fresh WFS sample into tests/fixtures/wfs for unit/e2e tests.
 *
 *   pnpm fixtures:record -- --bbox 399000,6688000,401000,6690000 --count 2 --name sample
 *
 * Coordinates are rounded to centimetres to keep fixtures small and stable.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { createWfsClient } from '../src/lib/wfs/client'

const { values } = parseArgs({
  options: {
    bbox: { type: 'string', default: '399000,6688000,401000,6690000' },
    count: { type: 'string', default: '2' },
    name: { type: 'string', default: 'forestusedeclaration.sample' },
    url: {
      type: 'string',
      default: process.env.WFS_BASE_URL ?? 'https://avoin.metsakeskus.fi/rajapinnat/v1/ows/',
    },
    layer: { type: 'string', default: process.env.WFS_LAYER ?? 'v1:forestusedeclaration' },
  },
})

function round(c: unknown): unknown {
  if (!Array.isArray(c)) return c
  if (typeof c[0] === 'number') return (c as number[]).map((n) => Math.round(n * 100) / 100)
  return c.map(round)
}

async function main() {
  const bbox = values.bbox!.split(',').map(Number) as [number, number, number, number]
  const client = createWfsClient({ baseUrl: values.url!, layer: values.layer! })
  const fc = await client.getDeclarations({ bbox, count: Number(values.count) })
  for (const f of fc.features) f.geometry.coordinates = round(f.geometry.coordinates) as never

  const dir = path.resolve(process.cwd(), 'tests/fixtures/wfs')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${values.name}.json`)
  writeFileSync(file, JSON.stringify(fc, null, 2) + '\n')
  console.log(`Wrote ${fc.features.length} features to ${file}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
