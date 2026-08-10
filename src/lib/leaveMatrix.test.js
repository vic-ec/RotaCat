import { describe, it, expect } from 'vitest'
import {
  leaveTypeGroupKey, blockPixelSpan, buildDoctorLeaveRows, leaveActiveOn,
  totalLeaveDays, totalCalendarDays, formatDMY, formatDateTime, MIN_BLOCK_WIDTH,
} from './leaveMatrix'

const COL = 60 // month column width used across the pixel-span tests

function req(overrides) {
  return {
    id: 'r', profile_id: 'p', leave_type: 'annual', status: 'approved',
    date_from: '2026-03-10', date_to: '2026-03-14', profiles: { name: 'Ada', surname: 'Zulu' },
    ...overrides,
  }
}

describe('leaveTypeGroupKey', () => {
  it('maps each type to its family, unknown types to the Weekend/Other catch-all', () => {
    expect(leaveTypeGroupKey('annual')).toBe('annual')
    expect(leaveTypeGroupKey('single_day')).toBe('annual')
    expect(leaveTypeGroupKey('sick')).toBe('sick')
    expect(leaveTypeGroupKey('special_leave')).toBe('family')
    expect(leaveTypeGroupKey('conference')).toBe('study')
    expect(leaveTypeGroupKey('maternity')).toBe('parental')
    expect(leaveTypeGroupKey('weekend_exception')).toBe('weekend')
    expect(leaveTypeGroupKey('something_new')).toBe('weekend')
  })
})

describe('blockPixelSpan', () => {
  it('positions a mid-month block under the right month column', () => {
    // March = index 2; 10th of a 31-day month.
    const span = blockPixelSpan('2026-03-10', '2026-03-14', 2026, COL)
    expect(span.left).toBeCloseTo(2 * COL + (9 / 31) * COL, 5)
    // 5 inclusive days (10th..14th) -> ends at start of 14th + one day cell.
    expect(span.width).toBeCloseTo((14 / 31) * COL - (9 / 31) * COL, 5)
  })

  it('spans across a month boundary', () => {
    const span = blockPixelSpan('2026-01-30', '2026-02-02', 2026, COL)
    expect(span.left).toBeCloseTo(0 * COL + (29 / 31) * COL, 5)
    // ends at start of Feb 2nd + 1/28 of Feb.
    expect(span.left + span.width).toBeCloseTo(1 * COL + (2 / 28) * COL, 5)
  })

  it('enforces a minimum width for a single-day block', () => {
    const span = blockPixelSpan('2026-06-15', '2026-06-15', 2026, COL)
    // one day of a 30-day June is 2px < MIN, so it clamps up.
    expect(span.width).toBe(MIN_BLOCK_WIDTH)
  })

  it('handles a leap-year February', () => {
    const span = blockPixelSpan('2024-02-29', '2024-02-29', 2024, COL)
    expect(span.left).toBeCloseTo(1 * COL + (28 / 29) * COL, 5)
  })

  it('clamps a range that starts before / ends after the year to the year edges', () => {
    const span = blockPixelSpan('2025-12-28', '2026-01-10', 2026, COL)
    expect(span.left).toBe(0) // clamped to Jan 1
    expect(span.left + span.width).toBeCloseTo((10 / 31) * COL, 5) // clamped to Jan 10, wide enough to clear the min-width floor
  })

  it('returns null when the range does not intersect the year', () => {
    expect(blockPixelSpan('2025-01-01', '2025-12-31', 2026, COL)).toBeNull()
    expect(blockPixelSpan('2027-01-01', '2027-01-05', 2026, COL)).toBeNull()
  })
})

describe('buildDoctorLeaveRows', () => {
  it('splits a doctor into approved and pending tracks and omits empty ones', () => {
    const rows = buildDoctorLeaveRows([
      req({ id: 'a', status: 'approved', date_from: '2026-03-01', date_to: '2026-03-05' }),
      req({ id: 'b', status: 'pending', date_from: '2026-05-01', date_to: '2026-05-03' }),
      req({ id: 'c', profile_id: 'q', status: 'approved', profiles: { name: 'Ben', surname: 'Adams' } }),
    ], 2026)
    expect(rows).toHaveLength(2)
    // sorted by surname -> Adams before Zulu
    expect(rows[0].doctor.surname).toBe('Adams')
    expect(rows[0].pending).toHaveLength(0)
    expect(rows[0].approved).toHaveLength(1)
    expect(rows[1].doctor.surname).toBe('Zulu')
    expect(rows[1].approved.map(r => r.id)).toEqual(['a'])
    expect(rows[1].pending.map(r => r.id)).toEqual(['b'])
  })

  it('excludes rejected/withdrawn leave and leave outside the year', () => {
    const rows = buildDoctorLeaveRows([
      req({ id: 'rej', status: 'rejected' }),
      req({ id: 'wd', status: 'withdrawn' }),
      req({ id: 'oldyear', status: 'approved', date_from: '2025-03-01', date_to: '2025-03-05' }),
    ], 2026)
    expect(rows).toHaveLength(0)
  })

  it('sorts each track by start date', () => {
    const [row] = buildDoctorLeaveRows([
      req({ id: 'late', date_from: '2026-09-01', date_to: '2026-09-02' }),
      req({ id: 'early', date_from: '2026-02-01', date_to: '2026-02-02' }),
    ], 2026)
    expect(row.approved.map(r => r.id)).toEqual(['early', 'late'])
  })
})

describe('leaveActiveOn', () => {
  it('returns only approved leave covering the date, grouped by family, deduped per doctor', () => {
    const byGroup = leaveActiveOn([
      req({ id: 'now', status: 'approved', date_from: '2026-08-01', date_to: '2026-08-31' }),
      req({ id: 'now2', profile_id: 'q', status: 'approved', leave_type: 'sick', date_from: '2026-08-09', date_to: '2026-08-11', profiles: { name: 'Bo', surname: 'X' } }),
      req({ id: 'pending', profile_id: 'r', status: 'pending', date_from: '2026-08-01', date_to: '2026-08-31' }),
      req({ id: 'past', profile_id: 's', status: 'approved', date_from: '2026-01-01', date_to: '2026-01-05' }),
    ], '2026-08-10')
    expect([...byGroup.keys()].sort()).toEqual(['annual', 'sick'])
    expect(byGroup.get('annual').map(d => d.id)).toEqual(['p'])
    expect(byGroup.get('sick').map(d => d.id)).toEqual(['q'])
  })

  it('is empty when no approved leave covers the date', () => {
    expect(leaveActiveOn([req({ status: 'pending' })], '2026-03-12').size).toBe(0)
  })
})

describe('day-count and format helpers', () => {
  it('totalCalendarDays counts inclusive days', () => {
    expect(totalCalendarDays({ date_from: '2026-03-10', date_to: '2026-03-14' })).toBe(5)
  })

  it('totalLeaveDays uses annual_leave_days for annual, calendar days otherwise', () => {
    expect(totalLeaveDays({ leave_type: 'annual', annual_leave_days: 3, date_from: '2026-03-10', date_to: '2026-03-16' })).toBe(3)
    expect(totalLeaveDays({ leave_type: 'sick', date_from: '2026-03-10', date_to: '2026-03-12' })).toBe(3)
  })

  it('formatDMY / formatDateTime reshape ISO strings', () => {
    expect(formatDMY('2026-03-14')).toBe('14-03-2026')
    expect(formatDMY(null)).toBe('—')
    expect(formatDateTime('2026-03-14T09:05:00Z')).toBe('14-03-2026 at 09:05')
    expect(formatDateTime(null)).toBeNull()
  })
})
