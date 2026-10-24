import { describe, expect, it } from 'vitest'

import { PRICING_PATH, marketingNavLinks } from '@/lib/marketing/routes'

describe('marketing header links (MV-101)', () => {
  it('lists Hinnoittelu between Miten se toimii and Kirjaudu when SHOW_PRICING is on', () => {
    expect(marketingNavLinks(true).map((link) => link.href)).toEqual([
      '/miten-se-toimii',
      PRICING_PATH,
      '/kirjaudu',
    ])
  })

  it('leaves the pricing link out when SHOW_PRICING is off, so no link leads to a 404', () => {
    expect(marketingNavLinks(false).map((link) => link.label)).toEqual([
      'Miten se toimii',
      'Kirjaudu',
    ])
  })
})
