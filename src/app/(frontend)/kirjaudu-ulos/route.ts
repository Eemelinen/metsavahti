import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { endSession, expiredSessionCookie } from '@/lib/auth/login'
import { toErrorResponse } from '@/lib/errors'

/** Where a logout lands (`03b` §15, ledger R2: the dedicated "Kirjauduttu ulos" screen). */
export const LOGGED_OUT_PATH = '/kirjauduttu-ulos'

/**
 * `/kirjaudu-ulos` (E03 MV-044, `03-pages.md`): POST only, so a plain `<form method="post">`
 * works without JavaScript and a link or a prefetch can never log someone out (Next answers
 * GET with 405). The session is removed from the user, the cookie is expired and the browser
 * is sent to `/kirjauduttu-ulos` with a 303, whatever the state of the session was.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })
    await endSession(payload, request.headers)
    const response = NextResponse.redirect(new URL(LOGGED_OUT_PATH, request.url), 303)
    response.cookies.set(expiredSessionCookie(payload))
    return response
  } catch (error) {
    return toErrorResponse(error)
  }
}
