import { describe, expect, it } from 'vitest'

import { wfs } from '@/config/wfs'
import { bboxContains, bboxForWatchArea, clusterBboxes } from '@/lib/geo/bbox'
import type { Bbox } from '@/lib/geo/buffer'
import { FINLAND_BOUNDS_3067, type LonLat, to3067, toWgs84 } from '@/lib/geo/crs'

const helsinki: LonLat = [24.94, 60.17]

/** Deterministic PRNG (mulberry32) so the random-areas case is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Square box of half-side `half` around an EPSG:3067 point. */
function square(e: number, n: number, half: number): Bbox {
  return [e - half, n - half, e + half, n + half]
}

function width(bbox: Bbox): number {
  return bbox[2] - bbox[0]
}

function height(bbox: Bbox): number {
  return bbox[3] - bbox[1]
}

describe('bboxForWatchArea', () => {
  it('is a square of half-side radius + padding around the projected centre', () => {
    const [e, n] = to3067(helsinki)
    const [minE, minN, maxE, maxN] = bboxForWatchArea(helsinki, 1_500, 250)
    expect(minE).toBeCloseTo(e - 1_750, 6)
    expect(minN).toBeCloseTo(n - 1_750, 6)
    expect(maxE).toBeCloseTo(e + 1_750, 6)
    expect(maxN).toBeCloseTo(n + 1_750, 6)
  })

  it('pads with wfs.bboxPaddingM by default', () => {
    expect(bboxForWatchArea(helsinki, 1_000)).toEqual(
      bboxForWatchArea(helsinki, 1_000, wfs.bboxPaddingM),
    )
    expect(width(bboxForWatchArea(helsinki, 1_000))).toBeCloseTo(2_000 + 2 * wfs.bboxPaddingM, 6)
  })

  it('accepts zero padding and rejects a non-positive radius or negative padding', () => {
    expect(width(bboxForWatchArea(helsinki, 500, 0))).toBeCloseTo(1_000, 6)
    expect(() => bboxForWatchArea(helsinki, 0)).toThrow(RangeError)
    expect(() => bboxForWatchArea(helsinki, -10)).toThrow(RangeError)
    expect(() => bboxForWatchArea(helsinki, Number.NaN)).toThrow(RangeError)
    expect(() => bboxForWatchArea(helsinki, 500, -1)).toThrow(RangeError)
  })
})

describe('clusterBboxes', () => {
  const cell = wfs.clusterCellSizeM
  const max = wfs.maxBboxSizeM

  it('returns no boxes for no areas', () => {
    expect(clusterBboxes([])).toEqual([])
  })

  it('returns a single area unchanged (as a copy)', () => {
    const only = square(400_000, 6_700_000, 1_000)
    const [result] = clusterBboxes([only])
    expect(result).toEqual(only)
    expect(result).not.toBe(only)
  })

  it('merges areas that share a grid cell into one box that contains both', () => {
    const a = square(400_100, 6_700_100, 1_000)
    const b = square(400_900, 6_700_900, 500)
    const result = clusterBboxes([a, b], cell)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual([399_100, 6_699_100, 401_400, 6_701_400])
  })

  it('merges neighbouring cells while the union stays within maxBboxSizeM', () => {
    // Four areas on one row, 30 km apart: 90 km + 2 km of half-sides fits in 100 km.
    const row = [0, 1, 2, 3].map((i) => square(400_000 + i * 30_000, 6_700_000, 1_000))
    const result = clusterBboxes(row, cell)
    expect(result).toHaveLength(1)
    expect(width(result[0] as Bbox)).toBe(92_000)
  })

  it('opens a new box when a union would exceed maxBboxSizeM', () => {
    // Five areas 30 km apart span 122 km: no single box may hold them all.
    const row = [0, 1, 2, 3, 4].map((i) => square(400_000 + i * 30_000, 6_700_000, 1_000))
    const result = clusterBboxes(row, cell)
    expect(result).toHaveLength(2)
    for (const box of result) {
      expect(width(box)).toBeLessThanOrEqual(max)
      expect(height(box)).toBeLessThanOrEqual(max)
    }
    for (const area of row) expect(result.some((box) => bboxContains(box, area))).toBe(true)
  })

  it('honours a custom maxBboxSizeM', () => {
    const row = [0, 1, 2, 3].map((i) => square(400_000 + i * 30_000, 6_700_000, 1_000))
    expect(clusterBboxes(row, cell, { maxBboxSizeM: 30_000 })).toHaveLength(4)
    expect(clusterBboxes(row, cell, { maxBboxSizeM: 65_000 })).toHaveLength(2)
  })

  it('keeps every area of an over-wide cell in its own seed instead of one oversize box', () => {
    // Two 30 km-radius areas whose centres share one 200 km cell but whose union is 260 km.
    const west = square(410_000, 6_700_000, 30_000)
    const east = square(610_000, 6_700_000, 30_000)
    const result = clusterBboxes([west, east], 200_000)
    expect(result).toHaveLength(2)
    expect(result).toEqual(expect.arrayContaining([west, east]))
  })

  it('does not depend on the input order', () => {
    const rnd = mulberry32(7)
    const areas = Array.from({ length: 50 }, () =>
      square(300_000 + rnd() * 200_000, 6_700_000 + rnd() * 200_000, 500 + rnd() * 10_000),
    )
    const forward = clusterBboxes(areas)
    const backward = clusterBboxes([...areas].reverse())
    expect(backward).toEqual(forward)
  })

  it('rejects an invalid cell size, an inverted area and an area larger than maxBboxSizeM', () => {
    const ok = square(400_000, 6_700_000, 1_000)
    expect(() => clusterBboxes([ok], 0)).toThrow(RangeError)
    expect(() => clusterBboxes([ok], cell, { maxBboxSizeM: -1 })).toThrow(RangeError)
    expect(() => clusterBboxes([[1, 1, 0, 0]])).toThrow(/areas\[0\] is not a valid bbox/)
    expect(() => clusterBboxes([square(400_000, 6_700_000, max)])).toThrow(
      /larger than maxBboxSizeM/,
    )
  })

  it.each([1, 2, 3, 42])(
    '1 000 random areas over Finland (seed %i) → ≤ 200 boxes, every area inside one',
    (seed) => {
      const rnd = mulberry32(seed)
      const bounds = FINLAND_BOUNDS_3067
      const areas = Array.from({ length: 1_000 }, () => {
        const e = bounds.minE + rnd() * (bounds.maxE - bounds.minE)
        const n = bounds.minN + rnd() * (bounds.maxN - bounds.minN)
        // Radius anywhere in the range the WatchAreas collection allows (up to 20 km).
        return bboxForWatchArea(toWgs84([e, n]), 100 + rnd() * 19_900)
      })

      const boxes = clusterBboxes(areas)

      expect(boxes.length).toBeLessThanOrEqual(200)
      for (const box of boxes) {
        expect(width(box)).toBeLessThanOrEqual(max)
        expect(height(box)).toBeLessThanOrEqual(max)
      }
      for (const area of areas) {
        expect(boxes.some((box) => bboxContains(box, area))).toBe(true)
      }
    },
  )
})
