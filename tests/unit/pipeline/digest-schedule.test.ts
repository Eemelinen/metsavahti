import { describe, expect, it } from 'vitest'

import { isDigestDue, scheduledDigestFor } from '@/lib/notifications/digest-schedule'

/** 2026-10-24 is a Saturday in summer time (UTC+3); 2026-10-26 a Monday in winter time (UTC+2). */
describe('scheduledDigestFor (MV-074)', () => {
  it('makes the 09:30 Finnish run the daily digest run, also across the DST switch', () => {
    expect(scheduledDigestFor(new Date('2026-10-24T06:30:00Z'))).toBe('daily')
    expect(scheduledDigestFor(new Date('2026-10-27T07:30:00Z'))).toBe('daily')
  })

  it('sends no digest on the 21:30 run or outside the morning window', () => {
    expect(scheduledDigestFor(new Date('2026-10-24T18:30:00Z'))).toBeNull()
    expect(scheduledDigestFor(new Date('2026-10-24T05:59:00Z'))).toBeNull() // 08:59
    expect(scheduledDigestFor(new Date('2026-10-24T09:00:00Z'))).toBeNull() // 12:00
  })

  it("makes Monday's morning run the weekly digest run", () => {
    expect(scheduledDigestFor(new Date('2026-10-26T07:30:00Z'))).toBe('weekly')
    // 06:30 UTC on Monday is still 08:30 in Helsinki: not yet the digest run.
    expect(scheduledDigestFor(new Date('2026-10-26T06:30:00Z'))).toBeNull()
    expect(scheduledDigestFor(new Date('2026-10-26T19:30:00Z'))).toBeNull()
  })

  it('reads the weekday in Finnish time, not UTC', () => {
    // Sunday 23:30 UTC is Monday 01:30 in Helsinki: Monday, but outside the window.
    expect(scheduledDigestFor(new Date('2026-10-25T23:30:00Z'))).toBeNull()
    // Monday 09:15 Helsinki in summer (2026-06-01, UTC+3).
    expect(scheduledDigestFor(new Date('2026-06-01T06:15:00Z'))).toBe('weekly')
  })
})

describe('isDigestDue', () => {
  it('sends daily digests on every digest run and weekly ones on the weekly run only', () => {
    expect(isDigestDue('daily', 'daily')).toBe(true)
    expect(isDigestDue('daily', 'weekly')).toBe(true)
    expect(isDigestDue('weekly', 'daily')).toBe(false)
    expect(isDigestDue('weekly', 'weekly')).toBe(true)
    expect(isDigestDue('daily', null)).toBe(false)
    expect(isDigestDue('weekly', null)).toBe(false)
  })
})
