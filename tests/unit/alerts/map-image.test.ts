import { describe, expect, it } from 'vitest'

import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_WIDTH,
  composeMapImageSvg,
  renderMapImagePng,
} from '@/lib/alerts/map-image'
import { mapColors } from '@/lib/design-tokens'
import type { AlertMapGeometry } from '@/lib/geo/spatial-queries'

const SQUARE = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [435000, 6900000],
        [435100, 6900000],
        [435100, 6900100],
        [435000, 6900100],
        [435000, 6900000],
      ],
    ],
  ],
} as const satisfies AlertMapGeometry['declaration']

const base: AlertMapGeometry = {
  ownerId: 1,
  center: [435050, 6900050],
  radiusM: 500,
  declaration: SQUARE,
  cuttingTypeCode: 4,
}

const numbers = (svg: string, pattern: RegExp) => svg.match(pattern)!.slice(1).map(Number)

/** MV-077: the SVG behind the alert email's static map. */
describe('composeMapImageSvg', () => {
  it('fits the watch circle into the frame, north up, with metres kept square', () => {
    const svg = composeMapImageSvg(base)
    expect(svg).toContain(`width="${MAP_IMAGE_WIDTH}" height="${MAP_IMAGE_HEIGHT}"`)
    // 1 000 m diameter fitted into 320 − 2 × 24 px: centre in the middle, r = 136 px.
    const [cx, cy, r] = numbers(svg, /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/)
    expect([cx, cy, r]).toEqual([300, 160, 136])
    // The 100 m square around the centre: 27.2 px wide, top edge (north) above the centre.
    expect(svg).toContain('M286.4 173.6L313.6 173.6L313.6 146.4L286.4 146.4L286.4 173.6Z')
  })

  it('widens the extent to a polygon outside the circle', () => {
    const svg = composeMapImageSvg({ ...base, center: [434050, 6900050] })
    const [cx = 0, , r = 0] = numbers(svg, /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/)
    const pathXs = numbers(svg, /d="M([\d.]+) [\d.]+L([\d.]+)/)
    expect(cx - r).toBeGreaterThanOrEqual(24)
    expect(Math.max(...pathXs)).toBeLessThanOrEqual(MAP_IMAGE_WIDTH - 24)
  })

  it('colours the polygon by harvest type and draws the circle alone without one', () => {
    expect(composeMapImageSvg(base)).toContain(`fill="${mapColors.cut.uudistus}"`)
    expect(composeMapImageSvg({ ...base, cuttingTypeCode: 2 })).toContain(
      `fill="${mapColors.cut.harvennus}"`,
    )
    expect(composeMapImageSvg({ ...base, cuttingTypeCode: null })).toContain(
      `fill="${mapColors.cut.muu}"`,
    )
    expect(composeMapImageSvg({ ...base, declaration: null })).not.toContain('<path')
  })

  it('renders a 2× PNG', () => {
    const png = renderMapImagePng(base)
    const view = new DataView(png.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([
      MAP_IMAGE_WIDTH * 2,
      MAP_IMAGE_HEIGHT * 2,
    ])
  })
})
