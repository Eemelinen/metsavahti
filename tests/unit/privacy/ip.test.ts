import { describe, expect, it } from 'vitest'

import { truncateIp } from '@/lib/privacy/ip'

describe('truncateIp', () => {
  it('keeps the first three IPv4 octets', () => {
    expect(truncateIp('192.168.13.77')).toBe('192.168.13.0')
    expect(truncateIp(' 10.0.0.1 ')).toBe('10.0.0.0')
  })

  it('keeps the first three IPv6 hextets (/48)', () => {
    expect(truncateIp('2001:db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3::')
    expect(truncateIp('2001:DB8::1')).toBe('2001:db8:0::')
    expect(truncateIp('::1')).toBe('0:0:0::')
  })

  it('treats IPv4-mapped IPv6 as IPv4', () => {
    expect(truncateIp('::ffff:203.0.113.9')).toBe('203.0.113.0')
  })

  it('returns null for empty or invalid input', () => {
    expect(truncateIp(undefined)).toBeNull()
    expect(truncateIp('')).toBeNull()
    expect(truncateIp('not-an-ip')).toBeNull()
    expect(truncateIp('999.1.1.1')).toBeNull()
  })
})
