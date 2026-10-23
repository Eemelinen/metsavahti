import { describe, expect, it } from 'vitest'

import { metsakeskusAttribution } from '@/lib/attribution'

describe('metsakeskusAttribution', () => {
  it('formats the CC BY month/year attribution', () => {
    expect(metsakeskusAttribution(new Date(2026, 8, 6))).toBe(
      'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 09/2026',
    )
  })
})
