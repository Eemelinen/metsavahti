import { describe, expect, it } from 'vitest'

import { hakkuutapaLabel } from '@/lib/wfs/hakkuutapa'

describe('hakkuutapaLabel', () => {
  it('maps known codes', () => {
    expect(hakkuutapaLabel(4)).toBe('Avohakkuu')
  })
  it('falls back gracefully', () => {
    expect(hakkuutapaLabel(null)).toBe('Tuntematon hakkuutapa')
    expect(hakkuutapaLabel(999)).toBe('Hakkuutapa 999')
  })
})
