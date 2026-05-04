import { describe, it, expect } from 'vitest'
import { localHourFor, DEFAULT_TIMEZONE } from '@/server/lib/users/timezone'

describe('localHourFor', () => {
  // 2026-05-04 12:00 UTC — well-defined moment for cross-tz checks.
  const utcNoon = new Date('2026-05-04T12:00:00Z')

  it('returns the UTC hour when timezone is UTC', () => {
    expect(localHourFor(DEFAULT_TIMEZONE, utcNoon)).toBe(12)
  })

  it('returns the local hour for Australia/Sydney (UTC+10 in May)', () => {
    // Sydney is AEST (UTC+10) in May (no DST). Noon UTC = 22:00 Sydney.
    expect(localHourFor('Australia/Sydney', utcNoon)).toBe(22)
  })

  it('returns the local hour for America/Los_Angeles (UTC-7 in May, DST)', () => {
    // LA is PDT (UTC-7) in May. Noon UTC = 05:00 LA.
    expect(localHourFor('America/Los_Angeles', utcNoon)).toBe(5)
  })

  it('handles midnight wrap correctly', () => {
    // 00:00 UTC on 2026-05-04 = 10:00 same-day Sydney.
    const utcMidnight = new Date('2026-05-04T00:00:00Z')
    expect(localHourFor('Australia/Sydney', utcMidnight)).toBe(10)
  })

  it('falls back to UTC hour for an invalid timezone string', () => {
    expect(localHourFor('Not/A/Real/Zone', utcNoon)).toBe(12)
  })

  it('returns 0-23 range', () => {
    for (let h = 0; h < 24; h++) {
      const when = new Date(`2026-05-04T${String(h).padStart(2, '0')}:00:00Z`)
      const result = localHourFor('UTC', when)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(24)
    }
  })
})
