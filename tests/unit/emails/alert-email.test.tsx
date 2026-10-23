// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { renderAlertEmail } from '@/emails/AlertEmail'

describe('alert email', () => {
  it('renders html and plain text with declarations and attribution', async () => {
    const { html, text } = await renderAlertEmail({
      watchAreaName: 'Mökki',
      baseUrl: 'https://metsavahti.test',
      attribution: 'Sisältää Suomen metsäkeskuksen Metsänkäyttöilmoitukset-aineistoa 09/2026',
      declarations: [
        {
          declarationNumber: '1-2026-1',
          hakkuutapa: 4,
          areaHa: 2.5,
          distanceM: 350,
          changeType: 'new',
        },
        {
          declarationNumber: '1-2026-2',
          hakkuutapa: null,
          areaHa: null,
          distanceM: 1200.4,
          changeType: 'geometry_changed',
        },
      ],
    })
    expect(html).toContain('Mökki')
    expect(html).toContain('1-2026-1')
    expect(html).toContain('Avohakkuu')
    expect(html).toContain('(rajaus muuttunut)')
    expect(html).toContain('https://metsavahti.test/dashboard')
    expect(text).toContain('Metsänkäyttöilmoitukset-aineistoa 09/2026')
    expect(text).toContain('1200 m')
  })
})
