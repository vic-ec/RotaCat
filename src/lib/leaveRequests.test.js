import { describe, it, expect } from 'vitest'
import {
  isValidWeekendExceptionRange,
  isSickBackdateAllowed,
  computeIncludesPublicHoliday,
  findDoubleBookingConflicts,
  isValidAnnualLeaveDays,
  annualDaysSummary,
  formatRequestDateRange,
  SPECIAL_LEAVE_TYPES,
  SPECIAL_LEAVE_SOFT_CAP,
  findWorstAnnualCapacitySlot,
  findWorstSpecialLeavePressure,
  countSpecialLeavePressureDaysInYear,
} from './leaveRequests'
import { overlapsPlannedWeekend } from './weekendPlanner'

describe('SPECIAL_LEAVE_TYPES', () => {
  it('excludes annual, sick, and weekend_exception but includes every other leave type', () => {
    expect(SPECIAL_LEAVE_TYPES).not.toContain('annual')
    expect(SPECIAL_LEAVE_TYPES).not.toContain('sick')
    // weekend_exception doesn't reduce required hours (it's an exception to
    // which weekend you work, not leave), so it shouldn't count as "days off".
    expect(SPECIAL_LEAVE_TYPES).not.toContain('weekend_exception')
    expect(SPECIAL_LEAVE_TYPES).toEqual(expect.arrayContaining(['family_responsibility', 'study', 'workshop', 'conference']))
  })
})

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

describe('isValidAnnualLeaveDays', () => {
  it('accepts a value between 1 and the total days, inclusive', () => {
    expect(isValidAnnualLeaveDays(5, 7)).toBe(true)
    expect(isValidAnnualLeaveDays(7, 7)).toBe(true)
    expect(isValidAnnualLeaveDays(1, 7)).toBe(true)
  })

  it('rejects zero, negative, non-integer, or over-total values', () => {
    expect(isValidAnnualLeaveDays(0, 7)).toBe(false)
    expect(isValidAnnualLeaveDays(-1, 7)).toBe(false)
    expect(isValidAnnualLeaveDays(2.5, 7)).toBe(false)
    expect(isValidAnnualLeaveDays(8, 7)).toBe(false)
  })

  it('rejects non-numeric input (e.g. an empty form field)', () => {
    expect(isValidAnnualLeaveDays(NaN, 7)).toBe(false)
  })
})

describe('annualDaysSummary', () => {
  it('shows total vs annual days when they differ (a padding weekend)', () => {
    const summary = annualDaysSummary({
      leave_type: 'annual', date_from: '2026-08-08', date_to: '2026-08-14', annual_leave_days: 5,
    })
    expect(summary).toBe('7 total days (5 annual leave)')
  })

  it('still shows both numbers when they are equal, for consistent HR-audit visibility', () => {
    const summary = annualDaysSummary({
      leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', annual_leave_days: 5,
    })
    expect(summary).toBe('5 total days (5 annual leave)')
  })

  it('returns null for non-annual leave types', () => {
    expect(annualDaysSummary({
      leave_type: 'sick', date_from: '2026-08-10', date_to: '2026-08-14', annual_leave_days: 5,
    })).toBeNull()
  })

  it('returns null for a legacy annual row with no annual_leave_days recorded', () => {
    expect(annualDaysSummary({
      leave_type: 'annual', date_from: '2026-08-10', date_to: '2026-08-14', annual_leave_days: null,
    })).toBeNull()
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

describe('formatRequestDateRange', () => {
  it('formats a multi-day range as "DDD dd MMM YYYY to DDD dd MMM YYYY" with a weekend/Sat/Sun/PH summary', () => {
    // 2026-08-15 is a Saturday, 2026-08-30 is a Sunday — 3 full weekends,
    // 3 Saturdays, 3 Sundays in between.
    const { rangeLabel, extraLine } = formatRequestDateRange('2026-08-15', '2026-08-30', ['2026-08-24'])
    expect(rangeLabel).toBe('Sat 15 Aug 2026 to Sun 30 Aug 2026')
    expect(extraLine).toBe('3 weekends, 3 Saturdays, 3 Sundays, 1 Public Holiday included')
  })

  it('formats a single-day request as one date, not a repeated range', () => {
    const { rangeLabel, extraLine } = formatRequestDateRange('2026-08-12', '2026-08-12')
    expect(rangeLabel).toBe('Wed 12 Aug 2026')
    expect(extraLine).toBeNull()
  })

  it('counts a lone Saturday without its Sunday toward Saturdays but not weekends', () => {
    // 2026-08-14 (Fri) to 2026-08-15 (Sat) — a Saturday with no following Sunday in range.
    const { extraLine } = formatRequestDateRange('2026-08-14', '2026-08-15')
    expect(extraLine).toBe('1 Saturday included')
  })

  it('omits the summary line entirely when the range has no weekend days or public holidays', () => {
    // 2026-08-10 (Mon) to 2026-08-14 (Fri) — a plain working week.
    const { extraLine } = formatRequestDateRange('2026-08-10', '2026-08-14')
    expect(extraLine).toBeNull()
  })

  it('accepts a Set of public holiday dates as well as an array', () => {
    const { extraLine } = formatRequestDateRange('2026-08-10', '2026-08-10', new Set(['2026-08-10']))
    expect(extraLine).toBe('1 Public Holiday included')
  })
})

describe('findWorstAnnualCapacitySlot', () => {
  const maxByColumnKey = { OT_COSMO: 1 }
  const maxFullTime = 2

  it('picks the date with the least headroom in the shared full-time pool, not just the first date', () => {
    // 10th: 1 of 2 taken (1 headroom). 11th: 2 of 2 taken (0 headroom, the worst).
    const countByColumnPerDateMap = new Map([
      ['2026-08-10', new Map([['MO', 1]])],
      ['2026-08-11', new Map([['MO', 1], ['Registrar', 1]])],
    ])
    const result = findWorstAnnualCapacitySlot({
      dateFrom: '2026-08-10', dateTo: '2026-08-11', columnKey: 'MO', maxByColumnKey, maxFullTime, countByColumnPerDateMap,
    })
    expect(result).toEqual({ date: '2026-08-11', taken: 2, max: 2, atCapacity: true })
  })

  it('reads OT COSMO/Intern from its own independent column, not the full-time pool', () => {
    const countByColumnPerDateMap = new Map([
      ['2026-08-10', new Map([['MO', 2], ['Registrar', 1]])], // full-time pool full, OT untouched
    ])
    const result = findWorstAnnualCapacitySlot({
      dateFrom: '2026-08-10', dateTo: '2026-08-10', columnKey: 'OT_COSMO', maxByColumnKey, maxFullTime, countByColumnPerDateMap,
    })
    expect(result).toEqual({ date: '2026-08-10', taken: 0, max: 1, atCapacity: false })
  })

  it('breaks a tie between equally-constrained dates in favour of the earliest one', () => {
    const countByColumnPerDateMap = new Map([
      ['2026-08-10', new Map([['MO', 1]])],
      ['2026-08-11', new Map([['MO', 1]])],
    ])
    const result = findWorstAnnualCapacitySlot({
      dateFrom: '2026-08-10', dateTo: '2026-08-11', columnKey: 'MO', maxByColumnKey, maxFullTime, countByColumnPerDateMap,
    })
    expect(result.date).toBe('2026-08-10')
  })

  it('treats a date with no existing entries as fully open', () => {
    const result = findWorstAnnualCapacitySlot({
      dateFrom: '2026-08-10', dateTo: '2026-08-10', columnKey: 'MO', maxByColumnKey, maxFullTime, countByColumnPerDateMap: new Map(),
    })
    expect(result).toEqual({ date: '2026-08-10', taken: 0, max: 2, atCapacity: false })
  })
})

describe('SPECIAL_LEAVE_SOFT_CAP', () => {
  it('is 3 — the EC Leave Planner sheet\'s documented guideline', () => {
    expect(SPECIAL_LEAVE_SOFT_CAP).toBe(3)
  })
})

describe('findWorstSpecialLeavePressure', () => {
  it('picks the date with the most distinct doctors, not the first date', () => {
    const byDate = new Map([
      ['2026-08-10', [{ profile_id: 'p1' }]],
      ['2026-08-11', [{ profile_id: 'p1' }, { profile_id: 'p2' }, { profile_id: 'p3' }]],
    ])
    const result = findWorstSpecialLeavePressure({ dateFrom: '2026-08-10', dateTo: '2026-08-11', byDate })
    expect(result).toEqual({ date: '2026-08-11', count: 3, softCap: 3, overSoftCap: true })
  })

  it('does not double-count the same doctor with two overlapping rows on the same day', () => {
    const byDate = new Map([
      ['2026-08-10', [{ profile_id: 'p1' }, { profile_id: 'p1' }, { profile_id: 'p2' }]],
    ])
    const result = findWorstSpecialLeavePressure({ dateFrom: '2026-08-10', dateTo: '2026-08-10', byDate })
    expect(result.count).toBe(2)
    expect(result.overSoftCap).toBe(false)
  })

  it('accepts a custom profileIdOf accessor for already-reshaped rows', () => {
    const byDate = new Map([
      ['2026-08-10', [{ profileId: 'p1' }, { profileId: 'p2' }]],
    ])
    const result = findWorstSpecialLeavePressure({
      dateFrom: '2026-08-10', dateTo: '2026-08-10', byDate, profileIdOf: e => e.profileId,
    })
    expect(result.count).toBe(2)
  })

  it('treats a date with no entries as zero', () => {
    const result = findWorstSpecialLeavePressure({ dateFrom: '2026-08-10', dateTo: '2026-08-10', byDate: new Map() })
    expect(result).toEqual({ date: '2026-08-10', count: 0, softCap: 3, overSoftCap: false })
  })
})

describe('countSpecialLeavePressureDaysInYear', () => {
  it('counts only the dates that meet or exceed the soft cap', () => {
    const byDate = new Map([
      ['2026-03-10', [{ profile_id: 'p1' }, { profile_id: 'p2' }, { profile_id: 'p3' }]], // 3 -> over
      ['2026-03-11', [{ profile_id: 'p1' }, { profile_id: 'p2' }]], // 2 -> under
    ])
    expect(countSpecialLeavePressureDaysInYear({ year: 2026, byDate })).toBe(1)
  })

  it('returns 0 for a year with no pressure days', () => {
    expect(countSpecialLeavePressureDaysInYear({ year: 2026, byDate: new Map() })).toBe(0)
  })

  it('accepts a custom profileIdOf accessor for already-reshaped rows', () => {
    const byDate = new Map([
      ['2026-03-10', [{ profileId: 'p1' }, { profileId: 'p2' }, { profileId: 'p3' }]],
    ])
    expect(countSpecialLeavePressureDaysInYear({ year: 2026, byDate, profileIdOf: e => e.profileId })).toBe(1)
  })
})
