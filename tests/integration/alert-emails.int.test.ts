import type { MigrateUpArgs, PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { signMapImageToken } from '@/lib/alerts/map-image'
import { env } from '@/lib/env'
import { createJobContext } from '@/lib/jobs/context'
import { sendAlerts } from '@/lib/jobs/send-alerts'
import {
  UNSUBSCRIBE_TOKEN_TTL_SECONDS,
  unsubscribeUrl,
  unsubscribeWithToken,
} from '@/lib/notifications/unsubscribe'
import * as migration from '@/payload/migrations/20261024_210651_used_tokens'
import type { User, WatchArea } from '@/payload-types'
import { insertDeclarationRaw } from '../helpers/declarations'
import { createMailpitClient } from '../helpers/mailpit'
import { createTestUser, getTestPayload, resetDatabase } from '../helpers/payload'

/**
 * MV-073: the alert email carries a signed per-area unsubscribe link; `GET
 * /api/notifications/unsubscribe?token=` turns the area's notifications off once and sends the
 * browser to `/ilmoitukset-lopetettu`, and answers 400 to anything that is not a genuine link.
 */
describe('alert emails and the unsubscribe endpoint (MV-073)', () => {
  const mailpit = createMailpitClient(process.env.MAILPIT_API_URL!)
  let payload: Payload
  let owner: User & { password: string }
  let bystander: User & { password: string }

  async function get(query: string) {
    const { GET } = await import('@/app/api/notifications/unsubscribe/route')
    return GET(new Request(`http://localhost/api/notifications/unsubscribe${query}`))
  }

  const tokenOf = (url: string) => new URL(url).searchParams.get('token')!
  const pageState = (res: Response) =>
    res.status === 303 ? new URL(res.headers.get('location')!).searchParams.get('tila') : null

  /** A watch area of `user`, or of a fresh account (the free plan allows two areas each). */
  async function area(user: User | null, name: string): Promise<WatchArea> {
    const holder = user ?? (await createTestUser(payload, { name }))
    return payload.create({
      collection: 'watch-areas',
      data: { name, center: [25.745, 62.225], radiusM: 1000, owner: holder.id },
      overrideAccess: true,
    })
  }

  const ownerOf = (a: WatchArea) => (typeof a.owner === 'object' ? a.owner.id : a.owner)

  async function enabled(id: number): Promise<boolean | null | undefined> {
    const doc = await payload.findByID({ collection: 'watch-areas', id, overrideAccess: true })
    return doc.notificationsEnabled
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetDatabase(payload)
    owner = await createTestUser(payload, { name: 'Owner' })
    bystander = await createTestUser(payload, { name: 'Bystander' })
  })

  it('emails the alert with a working unsubscribe link that turns the area off', async () => {
    const mokki = await area(owner, 'Mökki')
    const declarationId = await insertDeclarationRaw(payload, {
      sourceId: 'forestusedeclaration.7301',
      cuttingTypeCode: 5,
    })
    const alert = await payload.create({
      collection: 'alerts',
      data: {
        user: owner.id,
        watchArea: mokki.id,
        declaration: declarationId,
        changeType: 'new',
        snapshot: {
          cuttingTypeLabel: 'Avohakkuu',
          areaHa: 2.5,
          distanceM: 352,
          receivedAt: '2026-09-05T06:00:00.000Z',
        },
      },
      overrideAccess: true,
    })

    await sendAlerts(createJobContext(payload, 'mv-073'), 'mv-073')

    let html = ''
    await vi.waitFor(
      async () => {
        const [message] = (await mailpit.listMessages()).filter(
          (m) => m.To[0]?.Address === owner.email && m.Subject.includes('Mökki'),
        )
        expect(message).toBeTruthy()
        html = (await mailpit.getMessage(message!.ID)).HTML
      },
      { timeout: 10_000, interval: 200 },
    )
    expect(html).toContain('Avohakkuu')
    expect(html).toContain('noin 350 m tontistasi')
    expect(html).toContain(`${env.NEXT_PUBLIC_SERVER_URL}/ilmoitukset/${alert.id}`)
    expect(html).toContain(`${env.NEXT_PUBLIC_SERVER_URL}/tili/ilmoitukset`)
    expect(html).toContain('Metsänkäyttöilmoitukset-aineistoa')
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(100 * 1024)
    const link = mailpit
      .extractFirstLink(html, '/api/notifications/unsubscribe?token=')!
      .replaceAll('&amp;', '&')

    const res = await get(new URL(link).search)
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(
      `${env.NEXT_PUBLIC_SERVER_URL}/ilmoitukset-lopetettu?tila=lopetettu`,
    )
    expect(await enabled(mokki.id)).toBe(false)
  })

  it('works once: a second click, even after the owner turned the area back on, changes nothing', async () => {
    const koti = await area(owner, 'Koti')
    const link = await unsubscribeUrl(owner.id, koti.id)

    expect(pageState(await get(new URL(link).search))).toBe('lopetettu')
    expect(await enabled(koti.id)).toBe(false)
    const used = await payload.find({ collection: 'used-tokens', overrideAccess: true })
    expect(used.docs.map((d) => d.purpose)).toContain('unsub')

    await payload.update({
      collection: 'watch-areas',
      id: koti.id,
      data: { notificationsEnabled: true },
      overrideAccess: true,
    })
    expect(pageState(await get(new URL(link).search))).toBe('kaytetty')
    expect(await enabled(koti.id)).toBe(true)

    // A fresh link from a later email still works.
    expect(pageState(await get(new URL(await unsubscribeUrl(owner.id, koti.id)).search))).toBe(
      'lopetettu',
    )
    expect(await enabled(koti.id)).toBe(false)
  })

  it('records one use when two clicks race', async () => {
    const mokki2 = await area(null, 'Mökki 2')
    const token = tokenOf(await unsubscribeUrl(ownerOf(mokki2), mokki2.id))
    const outcomes = await Promise.all([
      unsubscribeWithToken(payload, token),
      unsubscribeWithToken(payload, token),
    ])
    expect(outcomes.sort()).toEqual(['unsubscribed', 'used'])
    expect(await enabled(mokki2.id)).toBe(false)
  })

  describe('rejected links change nothing', () => {
    let target: WatchArea

    beforeAll(async () => {
      target = await area(null, 'Ennallaan')
    })

    it.each([
      ['no token', () => Promise.resolve('')],
      ['an empty token', () => Promise.resolve('?token=')],
      ['a malformed token', () => Promise.resolve('?token=not-a-jwt')],
      [
        'a tampered signature',
        async () => {
          const token = tokenOf(await unsubscribeUrl(ownerOf(target), target.id))
          const last = token.at(-1) === 'A' ? 'B' : 'A'
          return `?token=${token.slice(0, -1)}${last}`
        },
      ],
      [
        'a tampered payload (another area)',
        async () => {
          const [header, , signature] = tokenOf(
            await unsubscribeUrl(ownerOf(target), target.id),
          ).split('.')
          const forged = Buffer.from(
            JSON.stringify({ purpose: 'unsub', sub: String(ownerOf(target)), watchAreaId: '1' }),
          ).toString('base64url')
          return `?token=${header}.${forged}.${signature}`
        },
      ],
      [
        'a token signed for another purpose',
        async () => `?token=${await signMapImageToken(owner.id, target.id)}`,
      ],
    ])('answers 400 to %s', async (_, query) => {
      const res = await get(await query())
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ ok: false, error: 'invalid_token' })
      expect(await enabled(target.id)).toBe(true)
    })

    it('shows the expired page for a genuine link older than 30 days', async () => {
      const issued = new Date(Date.now() - (UNSUBSCRIBE_TOKEN_TTL_SECONDS + 60) * 1000)
      const res = await get(
        new URL(await unsubscribeUrl(ownerOf(target), target.id, issued)).search,
      )
      expect(pageState(res)).toBe('vanhentunut')
      expect(await enabled(target.id)).toBe(true)
    })

    it("treats a link naming someone else's area as dead", async () => {
      const other = await area(bystander, 'Toisen')
      const res = await get(new URL(await unsubscribeUrl(owner.id, other.id)).search)
      expect(pageState(res)).toBe('vanhentunut')
      expect(await enabled(other.id)).toBe(true)
    })

    it('treats a link to a deleted area as dead', async () => {
      const gone = await area(null, 'Poistettu')
      const link = await unsubscribeUrl(ownerOf(gone), gone.id)
      await payload.delete({ collection: 'watch-areas', id: gone.id, overrideAccess: true })
      expect(pageState(await get(new URL(link).search))).toBe('vanhentunut')
    })
  })

  it('migration round-trip drops and recreates the table (runs last)', async () => {
    const db = (payload.db as unknown as PostgresAdapter).drizzle
    const args = { db } as unknown as MigrateUpArgs
    const tables = async () =>
      (
        await db.execute<{ n: number }>(sql`
          SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'used_tokens'
        `)
      ).rows[0]!.n

    await migration.down(args)
    expect(await tables()).toBe(0)
    await migration.up(args)
    expect(await tables()).toBe(1)
    const again = await area(null, 'Uudelleen')
    expect(
      pageState(await get(new URL(await unsubscribeUrl(ownerOf(again), again.id)).search)),
    ).toBe('lopetettu')
  })
})
