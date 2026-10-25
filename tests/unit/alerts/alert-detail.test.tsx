// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { markAlertRead } from '@/app/(frontend)/(app)/ilmoitukset/actions'
import { AlertDetail } from '@/app/(frontend)/(app)/ilmoitukset/[id]/alert-detail'
import { wfs } from '@/config/wfs'
import type { AlertDetail as AlertDetailData } from '@/lib/alerts/detail'
import type { MapSources } from '@/lib/map-sources'

vi.mock('@/app/(frontend)/(app)/ilmoitukset/actions', () => ({
  markAlertRead: vi.fn(async (id: number) => ({ ok: true, data: { id, readAt: '' } })),
}))
// MapLibre needs WebGL; the test reads what the page hands the map.
const map = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
vi.mock('@/components/map/map-view', () => ({
  MapView: (props: Record<string, unknown>) => {
    map.props = props
    return null
  },
}))

afterEach(() => {
  cleanup()
  // Calls only: the action mock keeps answering ok.
  vi.mocked(markAlertRead).mockClear()
})

const SOURCES: MapSources = {
  baseTiles: { url: 'https://tiles.example.test/{z}/{x}/{y}.png', attribution: '©' },
  wms: { url: 'https://wms.example.test/ows', minZoom: 12 },
}

const ALERT: AlertDetailData = {
  id: 12,
  changeType: 'new',
  unread: true,
  createdAt: '2026-10-20T06:00:00.000Z',
  watchArea: { id: 3, name: 'Mökki', center: [25.7, 62.2], radiusM: 500 },
  snapshot: {
    cuttingTypeLabel: 'Avohakkuu',
    areaHa: 2.4,
    distanceM: 350,
    receivedAt: '2026-10-18T09:00:00.000Z',
  },
  cuttingTypeCode: 5,
  declarationNumber: '1-2026-42',
  validUntil: '2029-10-18T09:00:00.000Z',
  declaration: {
    type: 'Feature',
    id: 77,
    geometry: { type: 'MultiPolygon', coordinates: [] },
    properties: {
      sourceId: 'forestusedeclaration.77',
      declarationNumber: '1-2026-42',
      cuttingTypeCode: 5,
      cuttingTypeLabel: 'Avohakkuu',
      areaHa: 2.4,
      receivedAt: '2026-10-18T09:00:00.000Z',
      validUntil: '2029-10-18T09:00:00.000Z',
      distanceM: 350,
    },
  },
  updated: null,
}

/** MV-082: what `/ilmoitukset/[id]` renders from `loadAlertDetail()` (App artboard `ilmoitus`). */
describe('AlertDetail (MV-082)', () => {
  it('shows the snapshot facts, the explainer, the links and the polygon map', () => {
    render(<AlertDetail alert={ALERT} sources={SOURCES} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '2,4 ha, 350 m vahtialueesta Mökki',
    )
    const facts = screen.getByTestId('alert-attributes')
    expect(facts).toHaveTextContent('Ilmoitus saapunut18.10.2026')
    expect(facts).toHaveTextContent('HakkuutapaAvohakkuu')
    expect(facts).toHaveTextContent('350 m vahtialueen keskipisteestä')
    expect(facts).toHaveTextContent('Ilmoitusnumero1-2026-42')
    expect(facts).toHaveTextContent('18.10.2029 asti')
    expect(facts).toHaveTextContent('Aikaisintaan10 päivää ilmoituksesta')
    expect(screen.queryByTestId('alert-updated')).not.toBeInTheDocument()

    const explainer = screen.getByText('Mitä tämä tarkoittaa?').closest('details')!
    expect(explainer).toHaveTextContent('Avohakkuu: Lähes kaikki puut kaadetaan')
    expect(explainer).toHaveTextContent('Ilmoitus ei velvoita hakkaamaan')

    expect(screen.getByRole('link', { name: 'Avaa vahtialue' })).toHaveAttribute(
      'href',
      '/vahtialueet/3',
    )
    const service = screen.getByRole('link', { name: /^Metsäkeskuksen karttapalvelu/ })
    expect(service).toHaveAttribute('href', wfs.mapServiceUrl)
    expect(service).toHaveAttribute('target', '_blank')
    expect(service).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: '← Ilmoitukset' })).toHaveAttribute(
      'href',
      '/ilmoitukset',
    )

    expect(map.props).toMatchObject({
      center: [25.7, 62.2],
      radiusM: 500,
      fit: 'declarations',
      declarationList: false,
      declarationsGeoJSON: { type: 'FeatureCollection', features: [ALERT.declaration] },
    })
  })

  it('marks an unread alert read on view, and leaves a read one alone', () => {
    render(<AlertDetail alert={ALERT} sources={SOURCES} />)
    expect(markAlertRead).toHaveBeenCalledWith(12)

    cleanup()
    vi.mocked(markAlertRead).mockClear()
    render(<AlertDetail alert={{ ...ALERT, unread: false }} sources={SOURCES} />)
    expect(markAlertRead).not.toHaveBeenCalled()
  })

  it('says "Tiedot päivittyneet" with the current values when the declaration changed', () => {
    render(
      <AlertDetail
        alert={{
          ...ALERT,
          changeType: 'attributes_changed',
          cuttingTypeCode: 3,
          updated: {
            removed: false,
            changes: [
              { field: 'cuttingType', was: 'Avohakkuu', now: 'Harvennushakkuu' },
              { field: 'areaHa', was: 2.4, now: 3.1 },
            ],
          },
        }}
        sources={SOURCES}
      />,
    )
    const note = screen.getByTestId('alert-updated')
    expect(within(note).getByRole('heading', { level: 2 })).toHaveTextContent('Tiedot päivittyneet')
    expect(note).toHaveTextContent('Hakkuutapa nytHarvennushakkuu')
    expect(note).toHaveTextContent('Pinta-ala nyt3,1 ha')
    // The facts stay the snapshot's; the type header follows the current code.
    expect(screen.getByTestId('alert-attributes')).toHaveTextContent('HakkuutapaAvohakkuu')
    expect(screen.getByText('Harvennushakkuu', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/Ilmoituksen tiedot, esimerkiksi hakkuutapa/)).toBeInTheDocument()

    cleanup()
    render(
      <AlertDetail
        alert={{ ...ALERT, updated: { removed: true, changes: [] } }}
        sources={SOURCES}
      />,
    )
    expect(screen.getByTestId('alert-updated')).toHaveTextContent(
      'Ilmoitus ei ole enää Metsäkeskuksen aineistossa.',
    )
  })
})
