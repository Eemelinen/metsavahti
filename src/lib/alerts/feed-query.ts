import { z } from 'zod'

/*
 * The URL of `/ilmoitukset` (E07 MV-080): `?alue=` filters by watch area, `?ennen=` is the
 * cursor of the next page. Browser-safe: the feed's filter builds the next URL in the browser
 * with the same functions the server page parses it with.
 */

/** Where the next page starts: the last alert shown (sort `createdAt` desc, `id` desc). */
export type AlertFeedCursor = { createdAt: string; id: number }

export type AlertFeedQuery = { watchAreaId: number | null; cursor: AlertFeedCursor | null }

/** `<createdAt ms>-<id>`: opaque enough for a URL, exact enough for ties within one run. */
export function encodeAlertFeedCursor(cursor: AlertFeedCursor): string {
  return `${Date.parse(cursor.createdAt)}-${cursor.id}`
}

export function decodeAlertFeedCursor(value: string): AlertFeedCursor | null {
  const match = /^(\d{1,15})-([1-9]\d{0,8})$/.exec(value)
  if (!match) return null
  const createdAt = new Date(Number(match[1]))
  return Number.isNaN(createdAt.getTime())
    ? null
    : { createdAt: createdAt.toISOString(), id: Number(match[2]) }
}

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v)

/** `?alue=` and `?ennen=` of `/ilmoitukset`; a bad value is ignored. */
const feedParamsSchema = z.object({
  alue: z.preprocess(
    one,
    z
      .string()
      .regex(/^[1-9]\d{0,8}$/)
      .nullable()
      .catch(null),
  ),
  ennen: z.preprocess(one, z.string().nullable().catch(null)),
})

export function parseAlertFeedQuery(
  searchParams: Record<string, string | string[] | undefined>,
): AlertFeedQuery {
  const p = feedParamsSchema.parse(searchParams)
  return {
    watchAreaId: p.alue === null ? null : Number(p.alue),
    cursor: p.ennen === null ? null : decodeAlertFeedCursor(p.ennen),
  }
}

/** `?alue=…&ennen=…` (empty string when neither is set), the inverse of the parse. */
export function alertFeedQuery(query: { watchAreaId: number | null; cursor?: string | null }) {
  const params = new URLSearchParams()
  if (query.watchAreaId !== null) params.set('alue', String(query.watchAreaId))
  if (query.cursor) params.set('ennen', query.cursor)
  const search = params.toString()
  return search ? `?${search}` : ''
}
