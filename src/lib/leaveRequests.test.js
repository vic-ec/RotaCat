import { describe, it, expect } from 'vitest'
import {
  isValidWeekendExceptionRange,
  isSickBackdateAllowed,
  computeIncludesPublicHoliday,
  findDoubleBookingConflicts,
} from './leaveRequests'
import { overlapsPlannedWeekend } from './weekendPlanner'

describe('findDoubleBookingConflicts', () => {
  it('normal annual request with no existing bookings passes clean', () => {
    const result = findDoubleBookingConflicts({
      dateFrom: '2026-08-10',
      dateTo: '2026-08-14',
      existingLeaveRequests: [],
      rosterEntryDates: [],
    })
    expect(result.hasConflict).toBe(false)
  })

  it('blocks when the range overlaps an existing pending/approved leave request', () => {
    const result = findDoubleBookingConflicts({
      dateFrom: '2026-08-10',
      dateTo: '2026-08-14',
      existingLeaveRequests: [
        { date_from: '2026-08-12', date_to: '2026-08-16', status: 'approved' },
      ],
      rosterEntryDates: [],
    })
    expect(result.hasConflict).toBe(true)
    expect(result.leaveConflicts).toHaveLength(1)
  })

  it('ignores rejected leave requests when checking for double-booking', () => {
    const result = findDoubleBookingConflicts({
      dateFrom: '2026-08-10',
      dateTo: '2026-08-14',
      existingLeaveRequests: [
        { date_from: '2026-08-12', date_to: '2026-08-16', status: 'rejected' },
      ],
      rosterEntryDates: [],
    })
    expect(result.hasConflict).toBe(false)
  })

  it('blocks when a date in range already has an assigned roster shift', () => {
    const result = findDoubleBookingConflicts({
      dateFrom: '2026-08-10',
      dateTo: '2026-08-14',
      existingLeaveRequests: [],
      rosterEntryDates: ['2026-08-13'],
    })
    expect(result.hasConflict).toBe(true)
    expect(result.rosterConflicts).toEqual(['2026-08-13'])
  })
})

describe('isSickBackdateAllowed', () => {
  it('allows a sick request backdated within the window', () => {
    // 14-day window, backdated 10 days
    expect(isSickBackdateAllowed('2026-07-19', '2026-07-29', 14)).toBe(true)
  })

  it('rejects a sick request backdated outside the window for a non-admin', () => {
    // backdated 20 days, window is 14
    expect(isSickBackdateAllowed('2026-07-09', '2026-07-29', 14)).toBe(false)
  })

  it('allows a same-day or future sick request regardless of window', () => {
    expect(isSickBackdateAllowed('2026-07-29', '2026-07-29', 14)).toBe(true)
    expect(isSickBackdateAllowed('2026-08-05', '2026-07-29', 14)).toBe(true)
  })
})

describe('isValidWeekendExceptionRange', () => {
  it('accepts a single Saturday+Sunday pair', () => {
    // 2026-08-01 is a Saturday
    expect(isValidWeekendExceptionRange('2026-08-01', '2026-08-02')).toBe(true)
  })

  it('rejects a range spanning more than one weekend', () => {
    expect(isValidWeekendExceptionRange('2026-08-01', '2026-08-09')).toBe(false)
  })

  it('rejects a range that does not start on a Saturday', () => {
    expect(isValidWeekendExceptionRange('2026-08-02', '2026-08-03')).toBe(false)
  })
})

describe('computeIncludesPublicHoliday', () => {
  it('detects a public holiday inside the range', () => {
    expect(computeIncludesPublicHoliday('2026-08-08', '2026-08-12', ['2026-08-10'])).toBe(true)
  })

  it('returns false when no public holiday falls in range', () => {
    expect(computeIncludesPublicHoliday('2026-08-08', '2026-08-12', ['2026-08-20'])).toBe(false)
  })
})

describe('overlapsPlannedWeekend', () => {
  it('flags a leave range covering a planned weekend (Saturday in range)', () => {
    const entries = [{ weekend_saturday: '2026-08-15' }]
    expect(overlapsPlannedWeekend(entries, '2026-08-14', '2026-08-17')).toBe(true)
  })

  it('flags a leave range covering only the Sunday of a planned weekend', () => {
    const entries = [{ weekend_saturday: '2026-08-15' }]
    expect(overlapsPlannedWeekend(entries, '2026-08-16', '2026-08-18')).toBe(true)
  })

  it('does not flag a leave range that misses every planned weekend', () => {
    const entries = [{ weekend_saturday: '2026-08-15' }]
    expect(overlapsPlannedWeekend(entries, '2026-08-19', '2026-08-21')).toBe(false)
  })

  it('returns false gracefully when the doctor has no planner entries in range', () => {
    expect(overlapsPlannedWeekend([], '2026-08-14', '2026-08-17')).toBe(false)
  })
})
