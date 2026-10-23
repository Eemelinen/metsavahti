import { HttpResponse, http } from 'msw'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { toWgs84 } from '@/lib/geo/crs'
import type { DeclarationFeatureCollection } from '@/lib/wfs/schemas'
import { createMailpitClient } from '../helpers/mailpit'
import { server } from '../helpers/msw'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'
import {
  fixtureBbox,
  loadWfsFixture,
  parseBboxParam,
  wfsResponseForBbox,
} from '../helpers/wfs-fixture'

const WFS_URL = 'http://wfs.test/rajapinnat/v1/ows/'

describe('sync-declarations pipeline', () => {
  let fixture: DeclarationFeatureCollection
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)
  let ownerEmail: string

  function useWfsFixture(fc: DeclarationFeatureCollection) {
    server.use(
      http.get(WFS_URL, ({ request }) => {
        const bbox = parseBboxParam(new URL(request.url).searchParams.get('bbox'))
        return HttpResponse.json(wfsResponseForBbox(fc, bbox))
      }),
    )
  }

  async function runPipeline() {
    const payload = await getTestPayload()
    const job = await payload.jobs.queue({ workflow: 'sync-declarations', input: {} })
    const result = await payload.jobs.run({ allQueues: true })
    const status = result.jobStatus?.[String(job.id)]?.status
    expect(status, 'workflow should succeed').not.toBe('error')
    return payload
  }

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' }) // Mailpit + Postgres go over real sockets
    fixture = loadWfsFixture()
    const payload = await getTestPayload()
    await resetDatabase(payload)
    await mailpit.deleteAll()

    const owner = await createTestUser(payload, { name: 'Owner' })
    ownerEmail = owner.email
    const bystander = await createTestUser(payload, { name: 'Bystander' })

    const [minE, minN, maxE, maxN] = fixtureBbox(fixture)
    const nearCenter = toWgs84([(minE + maxE) / 2, (minN + maxN) / 2])

    await payload.create({
      collection: 'watch-areas',
      data: { name: 'Lähellä', center: nearCenter, radiusM: 800, owner: owner.id },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'watch-areas',
      // Rovaniemi — hundreds of km from the fixture polygons
      data: { name: 'Kaukana', center: [25.72, 66.5], radiusM: 5000, owner: bystander.id },
      overrideAccess: true,
    })
    // Creating users sends verification emails; only alert emails matter below.
    await mailpit.deleteAll()
  })

  const alertEmails = async () =>
    (await mailpit.listMessages()).filter((m) => m.Subject.startsWith('Metsävahti:'))

  afterAll(() => server.close())

  it('first run: caches declarations, creates alerts for the nearby area only, emails once', async () => {
    useWfsFixture(fixture)
    const payload = await runPipeline()

    const declarations = await payload.find({ collection: 'declarations', overrideAccess: true })
    expect(declarations.totalDocs).toBe(fixture.features.length)

    const alerts = await payload.find({ collection: 'alerts', overrideAccess: true, depth: 1 })
    expect(alerts.totalDocs).toBe(fixture.features.length)
    expect(new Set(alerts.docs.map((a) => a.changeType))).toEqual(new Set(['new']))
    expect(alerts.docs.every((a) => typeof a.notifiedAt === 'string')).toBe(true)
    expect(alerts.docs.every((a) => (a.snapshot as { distanceM: number }).distanceM >= 0)).toBe(
      true,
    )
    // `01 §3.4`: one join row per (watch area, declaration) pair carries the seen hashes.
    const joins = await payload.find({
      collection: 'watch-area-declarations',
      overrideAccess: true,
      depth: 1,
    })
    expect(joins.totalDocs).toBe(fixture.features.length)
    expect(
      joins.docs.every(
        (j) => j.lastSeenGeomHash === (j.declaration as { geomHash: string }).geomHash,
      ),
    ).toBe(true)
    expect(alerts.docs.every((a) => (a.watchArea as { name: string }).name === 'Lähellä')).toBe(
      true,
    )

    await mailpit.waitForMessages(1)
    const messages = await alertEmails()
    expect(messages).toHaveLength(1)
    expect(messages[0]!.To[0]!.Address).toBe(ownerEmail)
    const full = await mailpit.getMessage(messages[0]!.ID)
    for (const f of fixture.features) {
      expect(full.HTML).toContain(f.properties.FORESTUSEDECLARATIONNUMBER)
    }

    const log = await payload.find({ collection: 'notification-log', overrideAccess: true })
    expect(log.totalDocs).toBe(1)
    expect(log.docs[0]).toMatchObject({
      type: 'alert_immediate',
      status: 'sent',
      provider: 'nodemailer',
      providerMessageId: expect.any(String),
      sentAt: expect.any(String),
    })
  })

  it('second run with identical data is idempotent: no new alerts, no new email', async () => {
    useWfsFixture(fixture)
    const payload = await runPipeline()

    expect(
      (await payload.count({ collection: 'watch-area-declarations', overrideAccess: true }))
        .totalDocs,
    ).toBe(fixture.features.length)
    expect(
      (await payload.count({ collection: 'declarations', overrideAccess: true })).totalDocs,
    ).toBe(fixture.features.length)
    expect((await payload.count({ collection: 'alerts', overrideAccess: true })).totalDocs).toBe(
      fixture.features.length,
    )
    expect(await alertEmails()).toHaveLength(1)
    expect(
      (await payload.count({ collection: 'declaration-revisions', overrideAccess: true }))
        .totalDocs,
    ).toBe(0)
  })

  it('a changed geometry triggers a "geometry_changed" alert and a new email', async () => {
    const changed = structuredClone(fixture)
    const ring = changed.features[0]!.geometry.coordinates[0] as number[][]
    // Shift the first vertex by 5 m (and the closing vertex, to keep the ring valid).
    ring[0]![0]! += 5
    ring[ring.length - 1]![0]! += 5
    useWfsFixture(changed)
    const payload = await runPipeline()

    const alerts = await payload.find({ collection: 'alerts', overrideAccess: true, sort: 'id' })
    expect(alerts.totalDocs).toBe(fixture.features.length + 1)
    expect(alerts.docs.at(-1)!.changeType).toBe('geometry_changed')
    // The join row is updated in place, not duplicated.
    expect(
      (await payload.count({ collection: 'watch-area-declarations', overrideAccess: true }))
        .totalDocs,
    ).toBe(fixture.features.length)
    await mailpit.waitForMessages(2)
    expect(await alertEmails()).toHaveLength(2)

    // `01 §3.3`: the previous hashes of the changed declaration are kept as a revision.
    const revisions = await payload.find({
      collection: 'declaration-revisions',
      overrideAccess: true,
      depth: 1,
    })
    expect(revisions.totalDocs).toBe(1)
    const revision = revisions.docs[0]!
    const declaration = revision.declaration as {
      sourceId: string
      geomHash: string
      attrHash: string
    }
    expect(declaration.sourceId).toBe(fixture.features[0]!.id)
    expect(revision.prevGeomHash).not.toBe(declaration.geomHash)
    expect(revision.prevAttrHash).toBe(declaration.attrHash)
  })
})
