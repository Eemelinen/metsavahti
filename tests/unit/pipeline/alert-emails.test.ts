import { describe, expect, it } from 'vitest'

import { type AlertDigestProps, renderAlertDigest } from '@/emails/AlertDigest'
import { type AlertImmediateProps, renderAlertImmediate } from '@/emails/AlertImmediate'
import { type AlertEmailItem, alertDistanceText, formatAlertArea } from '@/emails/AlertParts'
import { env } from '@/lib/env'
import { buildAlertDigestEmail, buildAlertImmediateEmail } from '@/lib/notifications/alert-emails'
import { UNSUBSCRIBE_TOKEN_TTL_SECONDS } from '@/lib/notifications/unsubscribe'
import { checkToken } from '@/lib/tokens'

const BASE = 'https://metsavahti.test'
const ATTRIBUTION = 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 09/2026'
const UNSUB = `${BASE}/api/notifications/unsubscribe?token=unsub-mokki`

function item(id: number, overrides: Partial<AlertEmailItem> = {}): AlertEmailItem {
  return {
    href: `${BASE}/ilmoitukset/${id}`,
    changeType: 'new',
    declarationNumber: `1-2026-${id}`,
    cuttingTypeCode: 5,
    areaHa: 3.4,
    distanceM: 347,
    receivedAt: '2026-09-05T06:00:00.000Z',
    ...overrides,
  }
}

function immediate(overrides: Partial<AlertImmediateProps> = {}): AlertImmediateProps {
  return {
    watchAreaName: 'Mökki, Rääkkylä',
    alerts: [item(101, { mapImageUrl: `${BASE}/api/alerts/101/map-image.png?token=map-101` })],
    unsubscribeUrl: UNSUB,
    baseUrl: BASE,
    attribution: ATTRIBUTION,
    ...overrides,
  }
}

function digest(overrides: Partial<AlertDigestProps> = {}): AlertDigestProps {
  return {
    mode: 'weekly',
    periodStart: new Date('2026-08-31T06:30:00.000Z'),
    periodEnd: new Date('2026-09-06T06:30:00.000Z'),
    groups: [
      {
        watchAreaName: 'Mökki, Rääkkylä',
        unsubscribeUrl: UNSUB,
        alerts: [item(1), item(2, { cuttingTypeCode: 3, areaHa: 6.1, distanceM: 760 })],
      },
      {
        watchAreaName: 'Kotitalo, Vihti',
        unsubscribeUrl: `${BASE}/api/notifications/unsubscribe?token=unsub-koti`,
        alerts: [item(6, { cuttingTypeCode: 3, changeType: 'geometry_changed', distanceM: 0 })],
      },
    ],
    baseUrl: BASE,
    attribution: ATTRIBUTION,
    ...overrides,
  }
}

/** `href` values in the HTML (React escapes `&` as `&amp;`). */
const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replaceAll('&amp;', '&'))

const kilobytes = (html: string) => Buffer.byteLength(html, 'utf8') / 1024

describe('alert email formatting (MV-073)', () => {
  it.each([
    [0, 'tonttisi kohdalla'],
    [4, 'noin 10 m tontistasi'],
    [347, 'noin 350 m tontistasi'],
    [994, 'noin 990 m tontistasi'],
    [996, 'noin 1,0 km tontistasi'],
    [1234, 'noin 1,2 km tontistasi'],
  ])('distance %d m reads "%s"', (metres, text) => {
    expect(alertDistanceText(metres)).toBe(text)
  })

  it.each([
    [3.4, '3,4 ha'],
    [0.37, '0,37 ha'],
    [12, '12 ha'],
    [null, '– ha'],
  ])('area %s reads "%s"', (areaHa, text) => {
    expect(formatAlertArea(areaHa)).toBe(text)
  })
})

describe('AlertImmediate (Email artboard template 3)', () => {
  it('renders one alert with map, Finnish details, CTA, unsubscribe and settings links', async () => {
    const { html, text } = await renderAlertImmediate(immediate())

    expect(html).toMatchSnapshot()
    expect(text).toMatchSnapshot()

    expect(html).toContain('Uusi metsänkäyttöilmoitus vahtialueellasi Mökki, Rääkkylä')
    expect(html).toContain('Avohakkuu')
    expect(html).toContain('Lähes kaikki puut kaadetaan, ja alueelle kasvatetaan uusi metsä.')
    expect(html).toContain('noin 350 m tontistasi')
    expect(html).toContain('3,4 ha')
    expect(html).toContain('5.9.2026')
    expect(html).toContain(`src="${BASE}/api/alerts/101/map-image.png?token=map-101"`)
    expect(html).toContain('alt="Kartta vahtialueesta ja hakkuualueesta"')
    expect(hrefs(html)).toEqual(
      expect.arrayContaining([
        `${BASE}/ilmoitukset/101`,
        UNSUB,
        `${BASE}/tili/ilmoitukset`,
        `${BASE}/tietosuoja`,
      ]),
    )
    expect(html).toContain('Näytä kartalla')
    expect(html).toContain('Lopeta tämän alueen ilmoitukset')
    expect(html).toContain(ATTRIBUTION)
    expect(text).toContain(ATTRIBUTION)
    expect(text).toContain(UNSUB)
    expect(kilobytes(html)).toBeLessThan(100)
  })

  it('leaves the map image out when the alert has none (ENABLE_MAP_IMAGES off)', async () => {
    const { html } = await renderAlertImmediate(immediate({ alerts: [item(101)] }))
    expect(html).not.toContain('<img')
    expect(html).toContain('noin 350 m tontistasi')
  })

  it('names the change of a single changed alert', async () => {
    const { html } = await renderAlertImmediate(
      immediate({ alerts: [item(7, { changeType: 'geometry_changed', distanceM: 0 })] }),
    )
    expect(html).toContain('Metsänkäyttöilmoituksen rajaus muuttui vahtialueellasi')
    expect(html).toContain('Rajaus muuttunut')
    expect(html).toContain('tonttisi kohdalla')
  })

  it('lists several alerts with their own links and opens the alert list from the CTA', async () => {
    const { html } = await renderAlertImmediate(
      immediate({ alerts: [item(1), item(2, { changeType: 'attributes_changed' })] }),
    )
    expect(html).toContain(
      '2 uutta tai muuttunutta metsänkäyttöilmoitusta vahtialueellasi Mökki, Rääkkylä',
    )
    expect(html.match(/data-testid="alert-item"/g)).toHaveLength(2)
    expect(hrefs(html)).toEqual(
      expect.arrayContaining([
        `${BASE}/ilmoitukset/1`,
        `${BASE}/ilmoitukset/2`,
        `${BASE}/ilmoitukset`,
      ]),
    )
    expect(html).toContain('Avaa kaikki ilmoitukset')
  })

  it('stays under 100 KB with many alerts by listing ten and linking the rest', async () => {
    const alerts = Array.from({ length: 60 }, (_, i) =>
      item(i + 1, {
        mapImageUrl: `${BASE}/api/alerts/${i + 1}/map-image.png?token=${'x'.repeat(300)}`,
      }),
    )
    const { html } = await renderAlertImmediate(immediate({ alerts }))
    expect(html.match(/data-testid="alert-item"/g)).toHaveLength(10)
    expect(html).toContain('Lisäksi 50 ilmoitusta')
    expect(kilobytes(html)).toBeLessThan(100)
  })
})

describe('AlertDigest (Email artboard template 4)', () => {
  it('groups alerts by watch area with a count and an unsubscribe link per area', async () => {
    const { html, text } = await renderAlertDigest(digest())

    expect(html).toMatchSnapshot()
    expect(text).toMatchSnapshot()

    expect(html).toContain('Viikkokooste 31.8.–6.9.')
    expect(html).toContain('3 uutta tai muuttunutta metsänkäyttöilmoitusta vahtialueillasi')
    expect(html.match(/data-testid="digest-group"/g)).toHaveLength(2)
    expect(html).toContain('Mökki, Rääkkylä · 2 ilmoitusta')
    expect(html).toContain('Kotitalo, Vihti · 1 ilmoitus')
    expect(html).toContain('Harvennushakkuu')
    expect(html).toContain('Osa puista poistetaan, ja metsä jää kasvamaan harvempana.')
    expect(html).toContain('noin 760 m tontistasi')
    expect(html).toContain('saapunut 5.9.')
    expect(html).toContain('Rajaus muuttunut')
    expect(hrefs(html)).toEqual(
      expect.arrayContaining([
        `${BASE}/ilmoitukset/1`,
        `${BASE}/ilmoitukset/2`,
        `${BASE}/ilmoitukset/6`,
        `${BASE}/ilmoitukset`,
        UNSUB,
        `${BASE}/api/notifications/unsubscribe?token=unsub-koti`,
        `${BASE}/tili/ilmoitukset`,
      ]),
    )
    expect(html).toContain('Saat tämän viestin, koska olet valinnut viikoittaisen koosteen.')
    expect(text).toContain(ATTRIBUTION)
    expect(kilobytes(html)).toBeLessThan(100)
  })

  it('labels the daily digest with its day', async () => {
    const { html } = await renderAlertDigest(digest({ mode: 'daily' }))
    expect(html).toContain('Päiväkooste 6.9.')
    expect(html).toContain('olet valinnut päivittäisen koosteen')
  })

  it('stays under 100 KB with many areas and alerts', async () => {
    const groups = Array.from({ length: 10 }, (_, g) => ({
      watchAreaName: `Alue ${g + 1}`,
      unsubscribeUrl: `${BASE}/api/notifications/unsubscribe?token=${'u'.repeat(300)}${g}`,
      alerts: Array.from({ length: 40 }, (_, i) => item(g * 100 + i + 1)),
    }))
    const { html } = await renderAlertDigest(digest({ groups }))
    // Ten per area, forty in all; every area keeps its header and unsubscribe link.
    expect(html.match(/data-testid="alert-item"/g)).toHaveLength(40)
    expect(html.match(/data-testid="digest-group"/g)).toHaveLength(10)
    expect(html.match(/Lopeta alueen ilmoitukset/g)).toHaveLength(10)
    expect(html).toContain('Lisäksi 40 ilmoitusta')
    expect(kilobytes(html)).toBeLessThan(100)
  })
})

describe('alert email builders', () => {
  const now = new Date('2026-09-06T06:30:00.000Z')
  const source = (id: number) => ({
    id,
    changeType: 'new' as const,
    snapshot: {
      cuttingTypeLabel: 'Avohakkuu',
      areaHa: 2.5,
      distanceM: 350,
      receivedAt: '2026-09-05T06:00:00.000Z',
    },
    declaration: { declarationNumber: `1-2026-${id}`, cuttingTypeCode: 5 },
  })

  async function unsubscribeClaims(url: string) {
    const token = new URL(url).searchParams.get('token')!
    const checked = await checkToken('unsub', token, now)
    expect(checked.status).toBe('valid')
    return checked.status === 'valid' ? checked.claims : null
  }

  it('signs a 30-day unsubscribe link for the area and the map image per alert', async () => {
    const email = await buildAlertImmediateEmail({
      userId: 7,
      watchArea: { id: 42, name: 'Mökki' },
      alerts: [source(501)],
      now,
    })
    expect(email.subject).toBe('Metsävahti: Uusi metsänkäyttöilmoitus vahtialueellasi Mökki')
    const links = hrefs(email.html)
    const unsub = links.find((h) => h.includes('/api/notifications/unsubscribe?token='))!
    expect(unsub.startsWith(env.NEXT_PUBLIC_SERVER_URL)).toBe(true)
    const claims = await unsubscribeClaims(unsub)
    expect(claims).toMatchObject({ sub: '7', watchAreaId: '42', purpose: 'unsub' })
    expect(claims!.exp! - claims!.iat!).toBe(UNSUBSCRIBE_TOKEN_TTL_SECONDS)
    expect(links).toContain(`${env.NEXT_PUBLIC_SERVER_URL}/ilmoitukset/501`)
    // `.env.test` turns ENABLE_MAP_IMAGES on.
    expect(email.html).toContain(
      `${env.NEXT_PUBLIC_SERVER_URL}/api/alerts/501/map-image.png?token=`,
    )
    expect(email.html).toContain('Metsänkäyttöilmoitukset-aineistoa 09/2026')
  })

  it('gives every digest group its own unsubscribe link', async () => {
    const email = await buildAlertDigestEmail({
      userId: 7,
      mode: 'daily',
      periodStart: new Date('2026-09-05T06:30:00.000Z'),
      periodEnd: now,
      areas: [
        { watchArea: { id: 42, name: 'Mökki' }, alerts: [source(501)] },
        { watchArea: { id: 43, name: 'Koti' }, alerts: [source(502), source(503)] },
      ],
      now,
    })
    expect(email.subject).toBe('Metsävahti: 3 uutta metsänkäyttöilmoitusta vahtialueillasi')
    const unsubs = hrefs(email.html).filter((h) => h.includes('/api/notifications/unsubscribe'))
    const areas = await Promise.all(
      unsubs.map(async (u) => (await unsubscribeClaims(u))!.watchAreaId),
    )
    expect(areas).toEqual(['42', '43'])
  })
})
