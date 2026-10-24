import { randomUUID } from 'node:crypto'

import { Resvg } from '@resvg/resvg-js'
import type { Payload } from 'payload'

import { colors, mapColors } from '@/lib/design-tokens'
import { env } from '@/lib/env'
import { Forbidden, NotFound, Unauthorized, toErrorResponse } from '@/lib/errors'
import type { EastNorth } from '@/lib/geo/crs'
import { type AlertMapGeometry, findAlertMapGeometry } from '@/lib/geo/spatial-queries'
import { signToken, verifyToken } from '@/lib/tokens'
import { hakkuutapaCategory } from '@/lib/wfs/hakkuutapa'

/**
 * The static map image of an alert email (`01 §4.3`, `01 §6`, MV-077): the watch circle and
 * the declaration polygon drawn straight from EPSG:3067 into pixel space (no background tiles),
 * rendered SVG → PNG with `@resvg/resvg-js`. Behind `ENABLE_MAP_IMAGES`; the email degrades
 * to no image without it.
 */

/** Logical size; emails show it at this width, the PNG is rendered at `PIXEL_RATIO`×. */
export const MAP_IMAGE_WIDTH = 600
export const MAP_IMAGE_HEIGHT = 320
const PIXEL_RATIO = 2
const PADDING = 24

/** Browsers and mail proxies may keep the image for a week (the ticket's "cached 7 d"). */
export const MAP_IMAGE_CACHE_SECONDS = 7 * 24 * 60 * 60
/** An email opened up to a month later still shows its map (as long as the unsubscribe link). */
export const MAP_IMAGE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

type Ring = EastNorth[]

function polygonsOf(geometry: AlertMapGeometry['declaration']): Ring[][] {
  if (!geometry) return []
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.map((polygon) => polygon.map((ring) => ring.map(([e, n]) => [e, n] as EastNorth)))
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * The SVG for `geometry`: the extent of circle ∪ polygon fitted into the frame with equal
 * scale on both axes (metres stay square), north up. Colours come from `design-tokens.ts`.
 */
export function composeMapImageSvg(geometry: AlertMapGeometry): string {
  const [ce, cn] = geometry.center
  const r = geometry.radiusM
  const polygons = polygonsOf(geometry.declaration)

  let [minE, minN, maxE, maxN] = [ce - r, cn - r, ce + r, cn + r]
  for (const [e, n] of polygons.flat(2)) {
    minE = Math.min(minE, e)
    minN = Math.min(minN, n)
    maxE = Math.max(maxE, e)
    maxN = Math.max(maxN, n)
  }
  const scale = Math.min(
    (MAP_IMAGE_WIDTH - 2 * PADDING) / Math.max(maxE - minE, 1),
    (MAP_IMAGE_HEIGHT - 2 * PADDING) / Math.max(maxN - minN, 1),
  )
  const midE = (minE + maxE) / 2
  const midN = (minN + maxN) / 2
  const x = (e: number) => round(MAP_IMAGE_WIDTH / 2 + (e - midE) * scale)
  const y = (n: number) => round(MAP_IMAGE_HEIGHT / 2 - (n - midN) * scale)

  const category = hakkuutapaCategory(geometry.cuttingTypeCode)
  const paths = polygons.map((polygon) => {
    const d = polygon
      .map((ring) => `M${ring.map(([e, n]) => `${x(e)} ${y(n)}`).join('L')}Z`)
      .join('')
    return `<path d="${d}" fill="${mapColors.cut[category]}" fill-opacity="0.55" fill-rule="evenodd" stroke="${mapColors.cutLine[category]}" stroke-width="1.5" stroke-linejoin="round"/>`
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_IMAGE_WIDTH}" height="${MAP_IMAGE_HEIGHT}" viewBox="0 0 ${MAP_IMAGE_WIDTH} ${MAP_IMAGE_HEIGHT}">`,
    `<rect width="${MAP_IMAGE_WIDTH}" height="${MAP_IMAGE_HEIGHT}" fill="${colors.paper.sunken}"/>`,
    `<circle cx="${x(ce)}" cy="${y(cn)}" r="${round(r * scale)}" fill="${mapColors.watchAreaFill}" fill-opacity="0.12" stroke="${mapColors.watchAreaLine}" stroke-width="2"/>`,
    ...paths,
    `<circle cx="${x(ce)}" cy="${y(cn)}" r="5" fill="${mapColors.marker}" stroke="${colors.paper.raised}" stroke-width="2"/>`,
    '</svg>',
  ].join('')
}

export function renderMapImagePng(geometry: AlertMapGeometry): Uint8Array<ArrayBuffer> {
  const svg = composeMapImageSvg(geometry)
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: MAP_IMAGE_WIDTH * PIXEL_RATIO },
  })
    .render()
    .asPng()
  return new Uint8Array(png)
}

/** The `?token=` of an alert email's image URL: the alert's owner, that one alert. */
export function signMapImageToken(
  userId: number,
  alertId: number,
  now: Date = new Date(),
): Promise<string> {
  return signToken(
    'map-image',
    { sub: String(userId), jti: randomUUID(), alertId: String(alertId) },
    MAP_IMAGE_TOKEN_TTL_SECONDS,
    now,
  )
}

/**
 * `GET /api/alerts/[id]/map-image.png`. With `?token=` the signed link decides (403 when it is
 * not a live map-image token for this alert and its owner); without one the session must be
 * the alert's owner (401 guest, 403 anyone else). 404 when the flag is off or the alert is
 * missing. The token is not single-use: mail clients fetch an image more than once.
 */
export async function mapImageResponse(
  payload: Payload,
  request: Request,
  idParam: string,
  { enabled = env.ENABLE_MAP_IMAGES === '1' }: { enabled?: boolean } = {},
): Promise<Response> {
  try {
    if (!enabled) throw new NotFound()
    const alertId = /^[1-9]\d{0,9}$/.test(idParam) ? Number(idParam) : null

    const token = new URL(request.url).searchParams.get('token')
    let tokenOwner: number | null = null
    if (token !== null) {
      const claims = await verifyToken('map-image', token)
      if (!claims || alertId === null || claims.alertId !== String(alertId)) throw new Forbidden()
      tokenOwner = Number(claims.sub)
    }

    let sessionUser: number | null = null
    if (tokenOwner === null) {
      const { user } = await payload.auth({ headers: request.headers })
      if (!user || user.collection !== 'users') throw new Unauthorized()
      sessionUser = Number(user.id)
    }

    const geometry = alertId === null ? null : await findAlertMapGeometry(payload, alertId)
    if (!geometry) throw new NotFound()
    if (geometry.ownerId !== (tokenOwner ?? sessionUser)) throw new Forbidden()

    return new Response(renderMapImagePng(geometry), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': `private, max-age=${MAP_IMAGE_CACHE_SECONDS}`,
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
