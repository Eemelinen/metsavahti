import { createHmac } from 'node:crypto'

import { type JWTPayload, SignJWT, jwtVerify } from 'jose'

import { env } from '@/lib/env'

/**
 * What a signed link is for (`01 §9`: "short expiry, single purpose claim"). A token signed for
 * one purpose never verifies for another, so a leaked link cannot be replayed elsewhere.
 * Unsubscribe, export and map-image links add their purposes when their tickets land.
 */
export type TokenPurpose = 'email-change'

const ALGORITHM = 'HS256'
const ISSUER = 'metsavahti'

/**
 * The HS256 key: `TOKEN_SECRET`, or (when it is unset, as in older `.env` files) an HMAC of
 * `PAYLOAD_SECRET` with a fixed label, so the key never equals the one Payload signs session
 * cookies with.
 */
function signingKey(): Uint8Array {
  if (env.TOKEN_SECRET) return new TextEncoder().encode(env.TOKEN_SECRET)
  return createHmac('sha256', env.PAYLOAD_SECRET).update('metsavahti:signed-links').digest()
}

/**
 * Sign `claims` for `purpose` with `jose` (HS256), valid for `ttlSeconds` from `now`. `sub`
 * names the account and `jti` makes the token single-use where the caller stores it.
 */
export async function signToken(
  purpose: TokenPurpose,
  claims: { sub: string; jti: string } & Record<string, string>,
  ttlSeconds: number,
  now: Date = new Date(),
): Promise<string> {
  const { sub, jti, ...rest } = claims
  const issuedAt = Math.floor(now.getTime() / 1000)
  return new SignJWT({ ...rest, purpose })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(signingKey())
}

/**
 * The claims of a token signed for `purpose` that has not expired at `now`, or `null` for
 * anything else (bad signature, other purpose, expired, malformed). Callers never learn why:
 * every rejected link gets the same answer.
 */
export async function verifyToken(
  purpose: TokenPurpose,
  token: string,
  now: Date = new Date(),
): Promise<(JWTPayload & { sub: string; jti: string }) | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      currentDate: now,
      requiredClaims: ['sub', 'jti', 'exp'],
    })
    if (payload.purpose !== purpose || !payload.sub || !payload.jti) return null
    return payload as JWTPayload & { sub: string; jti: string }
  } catch {
    return null
  }
}
