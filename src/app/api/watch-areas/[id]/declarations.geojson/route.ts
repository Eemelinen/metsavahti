import { getPayload } from 'payload'

import config from '@payload-config'
import { requireUser } from '@/lib/auth/guards'
import { NotFound, toErrorResponse } from '@/lib/errors'
import { loadWatchAreaDetail } from '@/lib/watch-areas/detail'
import { watchAreaIdParam } from '@/lib/watch-areas/watch-area-schema'

export const dynamic = 'force-dynamic'

/**
 * The declarations of one watch area for its map layer (`01 §6`, E05 MV-067): a GeoJSON
 * FeatureCollection in WGS 84, feature `id` = declaration id, the properties of
 * `declarationsForWatchArea()` plus `isNew` (an unread alert of this area). Owner only: 401
 * without a session, 403 for someone else's area (admins too), 404 for an unknown id. Logic:
 * `lib/watch-areas/detail.ts`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const id = watchAreaIdParam((await params).id)
    if (id === null) throw new NotFound()
    const { declarations } = await loadWatchAreaDetail(await getPayload({ config }), user, id)
    return Response.json(declarations, {
      headers: {
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
