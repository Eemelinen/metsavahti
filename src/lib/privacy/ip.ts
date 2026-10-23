import { isIP } from 'node:net'

/**
 * Reduce an IP address to its network prefix before it is stored (`01 §3.7`: consent
 * events keep the IP "truncated to /24"). IPv4 keeps the first three octets; IPv6 keeps
 * the first three hextets (/48, the usual end-site allocation); IPv4-mapped IPv6 is
 * treated as IPv4. Anything that is not an IP address becomes `null` so garbage from a
 * proxy header is never persisted.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const value = ip.trim()
  const version = isIP(value)
  if (version === 4) return truncateIpv4(value)
  if (version === 6) {
    const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(value)
    if (mapped) return truncateIpv4(mapped[1]!)
    const [a, b, c] = expandIpv6(value)
    return `${a}:${b}:${c}::`
  }
  return null
}

function truncateIpv4(value: string): string {
  const [a, b, c] = value.split('.')
  return `${a}.${b}.${c}.0`
}

/** Expand `::` so the address has eight lower-case hextets without leading zeros. */
function expandIpv6(value: string): string[] {
  const [head = '', tail = ''] = value.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  const groups = [...left, ...Array.from({ length: Math.max(missing, 0) }, () => '0'), ...right]
  return groups.map((g) => g.replace(/^0+(?=.)/, ''))
}

/**
 * The caller's address as seen by a Server Action or Route Handler: the first entry of
 * `x-forwarded-for` (the reverse proxy prepends the client, `docs/TECH_STACK.md`), then
 * `x-real-ip`. Returns `null` when neither header carries an IP address, so a spoofed or
 * missing header never becomes a rate-limit key or a stored value by accident.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded && isIP(forwarded)) return forwarded
  const real = headers.get('x-real-ip')?.trim()
  if (real && isIP(real)) return real
  return null
}
