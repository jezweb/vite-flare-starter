/**
 * nextCronRun — all five cron fields participate (#95 doc-truth).
 *
 * Earlier versions read only minute+hour, so a "monthly" or "weekly"
 * schedule silently fired daily. These tests pin the date-field
 * matching (day-of-month, month, day-of-week incl. lists and 7=Sunday)
 * and the never-matches guard. All UTC.
 */
import { describe, it, expect } from 'vitest'
import { nextCronRun } from '@/server/modules/chat/tools/schedule'

// Wed 2026-07-15 10:00:00 UTC — fixed anchor so assertions are exact.
const AFTER = new Date(Date.UTC(2026, 6, 15, 10, 0, 0))

describe('nextCronRun', () => {
  it('daily at fixed time — later today when still ahead', () => {
    expect(nextCronRun('30 14 * * *', AFTER).toISOString()).toBe('2026-07-15T14:30:00.000Z')
  })

  it('daily at fixed time — tomorrow when already passed', () => {
    expect(nextCronRun('0 9 * * *', AFTER).toISOString()).toBe('2026-07-16T09:00:00.000Z')
  })

  it('monthly (day-of-month) no longer fires daily', () => {
    // 1st of the month at 08:00 — must be Aug 1, not tomorrow.
    expect(nextCronRun('0 8 1 * *', AFTER).toISOString()).toBe('2026-08-01T08:00:00.000Z')
  })

  it('weekly (day-of-week) lands on the requested weekday', () => {
    // Monday 14:30 — anchor is Wednesday, so next Monday is Jul 20.
    expect(nextCronRun('30 14 * * 1', AFTER).toISOString()).toBe('2026-07-20T14:30:00.000Z')
  })

  it('accepts 7 as Sunday', () => {
    expect(nextCronRun('0 6 * * 7', AFTER).getUTCDay()).toBe(0)
  })

  it('weekday lists pick the nearest member', () => {
    // Mon/Fri at 09:00 from a Wednesday → Friday Jul 17.
    expect(nextCronRun('0 9 * * 1,5', AFTER).toISOString()).toBe('2026-07-17T09:00:00.000Z')
  })

  it('month field constrains to the requested month', () => {
    // Dec 25 at 00:00 from July.
    expect(nextCronRun('0 0 25 12 *', AFTER).toISOString()).toBe('2026-12-25T00:00:00.000Z')
  })

  it('hourly (`30 * * * *`) fires at :30 of the NEXT hour, not daily', () => {
    // Anchor is 10:00 → 10:30 today. The old parser read this as 00:30
    // daily, silently dropping 23 fires a day.
    expect(nextCronRun('30 * * * *', AFTER).toISOString()).toBe('2026-07-15T10:30:00.000Z')
    // From 10:45, the :30 already passed → 11:30.
    const laterAnchor = new Date(Date.UTC(2026, 6, 15, 10, 45, 0))
    expect(nextCronRun('30 * * * *', laterAnchor).toISOString()).toBe('2026-07-15T11:30:00.000Z')
  })

  it('rejects sub-hourly (`*` minute) instead of misreading it', () => {
    expect(() => nextCronRun('* * * * *', AFTER)).toThrow(/sub-hourly/)
  })

  it('rejects out-of-range values instead of letting Date roll them over', () => {
    expect(() => nextCronRun('60 9 * * *', AFTER)).toThrow(/out of range/)
    expect(() => nextCronRun('0 24 * * *', AFTER)).toThrow(/out of range/)
    expect(() => nextCronRun('0 9 32 * *', AFTER)).toThrow(/out of range/)
    expect(() => nextCronRun('0 9 * 13 *', AFTER)).toThrow(/out of range/)
    expect(() => nextCronRun('0 9 * * 8', AFTER)).toThrow(/out of range/)
  })

  it('throws on specs that never match a date', () => {
    expect(() => nextCronRun('0 0 31 2 *', AFTER)).toThrow(/never matches/)
  })

  it('throws on unsupported field syntax instead of misfiring', () => {
    expect(() => nextCronRun('0 9 * * 1-5', AFTER)).toThrow(/Unsupported cron/)
  })

  it('throws on wrong field count', () => {
    expect(() => nextCronRun('0 9 *', AFTER)).toThrow(/5 fields/)
  })
})
