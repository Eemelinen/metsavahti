/**
 * Discover the Metsäkeskus forest-use declaration layer (MV-021): calls `GetCapabilities`
 * and `DescribeFeatureType`, prints the layer and its attributes and compares them with the
 * contract pinned in `src/lib/wfs/layer.ts`. Exits 1 when the layer is missing or drifted.
 *
 *   pnpm wfs:describe
 *   pnpm wfs:describe --write     # also record tests/fixtures/wfs/{capabilities,describe}.xml
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { MetsakeskusWfsClient } from '../src/lib/wfs/client'
import {
  attributeDrift,
  capabilitiesConstraint,
  findLayer,
  parseDescribeFeatureType,
} from '../src/lib/wfs/describe'
import { LAYER_DISCOVERED_AT, LAYER_NAME } from '../src/lib/wfs/layer'

const { values } = parseArgs({
  options: {
    url: {
      type: 'string',
      default: process.env.WFS_BASE_URL ?? 'https://avoin.metsakeskus.fi/rajapinnat/v1/ows/',
    },
    layer: { type: 'string', default: process.env.WFS_LAYER ?? LAYER_NAME },
    write: { type: 'boolean', default: false },
  },
})

async function main() {
  const client = new MetsakeskusWfsClient({
    baseUrl: values.url,
    layer: values.layer,
    timeoutMs: 60_000,
  })
  const [capabilities, describe] = await Promise.all([
    client.getCapabilitiesXml(),
    client.describeFeatureTypeXml(),
  ])

  if (values.write) {
    const dir = path.resolve(process.cwd(), 'tests/fixtures/wfs')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'capabilities.xml'), capabilities)
    writeFileSync(path.join(dir, 'describe.xml'), describe)
    console.log(`Recorded capabilities.xml and describe.xml in ${dir}`)
  }

  const layer = findLayer(capabilities, values.layer)
  if (!layer) {
    console.error(`GetCapabilities at ${values.url} does not advertise ${values.layer}`)
    process.exit(1)
  }
  console.log(`Layer        ${layer.name} (${layer.title ?? 'no title'})`)
  console.log(`DefaultCRS   ${layer.defaultCrs ?? '?'}`)
  console.log(`WGS84 bbox   ${layer.wgs84Bbox?.join(', ') ?? '?'}`)
  console.log(`CountDefault ${capabilitiesConstraint(capabilities, 'CountDefault') ?? '?'}`)
  console.log(
    `Paging       ${capabilitiesConstraint(capabilities, 'ImplementsResultPaging') ?? '?'}`,
  )

  const attributes = parseDescribeFeatureType(describe)
  console.log(`\n${attributes.length} properties:`)
  for (const { name, type, documentation } of attributes) {
    console.log(`  ${name.padEnd(32)} ${type.padEnd(22)} ${documentation ?? ''}`)
  }

  const drift = attributeDrift(attributes)
  const drifted = drift.added.length + drift.removed.length + drift.retyped.length > 0
  console.log(`\nPinned contract (src/lib/wfs/layer.ts, discovered ${LAYER_DISCOVERED_AT}):`)
  if (!drifted) console.log('  matches')
  for (const name of drift.added) console.log(`  + ${name} (not pinned)`)
  for (const name of drift.removed) console.log(`  - ${name} (pinned, no longer described)`)
  for (const line of drift.retyped) console.log(`  ~ ${line}`)
  if (drifted) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
