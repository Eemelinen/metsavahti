import { describe, expect, it } from 'vitest'

import {
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  watchAreaFormSchema,
  watchAreaIdSchema,
} from '@/lib/watch-areas/watch-area-schema'

const VALID = { name: 'Mökkimetsä', center: { lng: 25.75, lat: 62.24 }, radiusM: 800 }

const radiusError = (radiusM: unknown) => {
  const result = watchAreaFormSchema.safeParse({ ...VALID, radiusM })
  return result.success ? undefined : result.error.issues[0]?.message
}

/** MV-064: the form schema shared by the watch-area Server Actions and their forms. */
describe('watchAreaFormSchema', () => {
  it('trims the name, keeps an omitted switch omitted and clears an empty address', () => {
    expect(
      watchAreaFormSchema.parse({ ...VALID, name: '  Mökkimetsä  ', addressLabel: '   ' }),
    ).toEqual({ ...VALID, addressLabel: null })
    expect(watchAreaFormSchema.parse(VALID)).not.toHaveProperty('notificationsEnabled')
    expect(watchAreaFormSchema.parse({ ...VALID, notificationsEnabled: false })).toMatchObject({
      notificationsEnabled: false,
    })
  })

  it('accepts the radius bounds and refuses anything outside them or fractional', () => {
    expect(radiusError(MIN_RADIUS_M)).toBeUndefined()
    expect(radiusError(MAX_RADIUS_M)).toBeUndefined()
    for (const radiusM of [MIN_RADIUS_M - 1, MAX_RADIUS_M + 1, 250.5, '800', undefined]) {
      expect(radiusError(radiusM)).toBe('Säteen pitää olla 100–5000 m.')
    }
  })

  it('wants the centre in Finland', () => {
    const outside = [
      { lng: 18.07, lat: 59.33 }, // Stockholm
      { lng: 24.1, lat: 56.95 }, // Riga
      { lng: 0, lat: 0 },
    ]
    for (const center of outside) {
      const result = watchAreaFormSchema.safeParse({ ...VALID, center })
      expect(result.success).toBe(false)
    }
    expect(
      watchAreaFormSchema.safeParse({ ...VALID, center: { lng: 27.68, lat: 69.9 } }).success,
    ).toBe(true) // Utsjoki
  })

  it('limits the name and the address label', () => {
    expect(watchAreaFormSchema.safeParse({ ...VALID, name: 'x'.repeat(101) }).success).toBe(false)
    expect(watchAreaFormSchema.safeParse({ ...VALID, addressLabel: 'x'.repeat(201) }).success).toBe(
      false,
    )
  })

  it('takes positive integer ids only', () => {
    expect(watchAreaIdSchema.safeParse(7).success).toBe(true)
    for (const id of [0, -1, 1.5, '7', null])
      expect(watchAreaIdSchema.safeParse(id).success).toBe(false)
  })
})
