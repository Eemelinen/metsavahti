import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { loadAlertDetail } from '@/lib/alerts/detail'
import { requireUser } from '@/lib/auth/guards'
import { Forbidden, NotFound } from '@/lib/errors'
import { mapSources } from '@/lib/map-sources'
import { watchAreaIdParam } from '@/lib/watch-areas/watch-area-schema'

import { AlertDetail } from './alert-detail'

export const metadata: Metadata = { title: 'Ilmoitus' }
export const dynamic = 'force-dynamic'

/**
 * `/ilmoitukset/[id]` (E07 MV-082, App artboard `ilmoitus`): the alert's map zoomed to the
 * declaration's polygon with the watch circle, the facts frozen at alert time, "Tiedot
 * päivittyneet" when the declaration changed since, the "Mitä tämä tarkoittaa?" explainer of
 * its cutting type, "Avaa vahtialue" and the link to Metsäkeskus' map service. The page marks
 * the alert read once it is shown in the browser (`AlertDetail`), so a link prefetch never
 * does. Someone else's alert, a hidden `removed` one or an id that does not exist is a 404.
 */
export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params
  const user = await requireUser({ next: `/ilmoitukset/${idParam}` })
  // Alert ids are Postgres `integer`s like watch-area ids.
  const id = watchAreaIdParam(idParam)
  if (id === null) notFound()

  const alert = await loadAlertDetail(await getPayload({ config }), user, id).catch(
    (error: unknown) => {
      if (error instanceof NotFound || error instanceof Forbidden) notFound()
      throw error
    },
  )
  return <AlertDetail alert={alert} sources={mapSources()} />
}
