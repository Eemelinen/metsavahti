import { getPayload } from 'payload'

import config from '@payload-config'
import { dataExportDownloadResponse } from '@/lib/account/data-export'

export const dynamic = 'force-dynamic'

/**
 * The account export archive behind the signed link in `ExportReady` (`01 §6`, MV-093): 200
 * zip, 403 for a bad token, 410 once the link or the request has expired. Logic:
 * `lib/account/data-export.ts`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getPayload({ config })
  return dataExportDownloadResponse(payload, request, (await params).id)
}
