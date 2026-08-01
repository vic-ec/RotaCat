import { describe, it, expect } from 'vitest'
import {
  annualDaysUsedInYear, totalDaysUsedInYear, pendingRequestCount, upcomingRequests,
  totalDaysInRange, annualDaysInRange, pendingRequestCountInRange,
} from './leaveDashboard'

describe('totalDaysInRange', () => {
  it('sums inclusive days for requests fully inside an arbitrary (non-calendar-year) range', () => {
    const days = totalDaysInRange([{ date_from: '2026-04-10', date_to: '2026-04-14' }], '2026-04-01', '2026-06-30')
    expect(days).toBe(5)
  })

  it('clips a request that only partially overlaps the range on either side', () => {
    const days = totalDaysInRange(
      [{ date_from: '2026-03-28', date_to: '2026-04-03' }], // spans into the range from before it starts
      '2026-04-01', '2026-06-30'
    )
    expect(days).toBe(3) // 1, 2, 3 Apr
  })

  it('excludes requests entirely outside the range', () => {
    expect(totalDaysInRange([{ date_from: '2026-01-01', date_to: '2026-01-05' }], '2026-04-01', '2026-06-30')).toBe(0)
  })
})

describe('annualDaysInRange', () => {
  it('attributes annual_leave_days to the range if date_from falls inside it', () => {
    const days = annualDaysInRange(
      [{ date_from: '2026-04-15', date_to: '2026-04-21', annual_leave_days: 5 }],
      '2026-04-01', '2026-06-30'
    )
    expect(days).toBe(5)
  })

  it('does not attribute annual_leave_days when date_from falls outside the range, even if the range overlaps the tail', () => {
    const days = annualDaysInRange(
      [{ date_from: '2026-03-28', date_to: '2026-04-03', annual_leave_days: 5 }],
      '2026-04-01', '2026-06-30'
    )
    expect(days).toBe(0)
  })

  it('falls back to the clipped full range for legacy rows with no annual_leave_days', () => {
    const days = annualDaysInRange(
      [{ date_from: '2026-03-28', date_to: '2026-04-03' }],
      '2026-04-01', '2026-06-30'
    )
    expect(days).toBe(3) // 1, 2, 3 Apr
  })
})

describe('pendingRequestCountInRange', () => {
  it('counts pending requests starting inside an arbitrary range', () => {
    const count = pendingRequestCountInRange(
      [
        { date_from: '2026-04-15', status: 'pending' },
        { date_from: '2026-04-20', status: 'approved' },
        { date_from: '2026-01-01', status: 'pending' },
      ],
      '2026-04-01', '2026-06-30'
    )
    expect(count).toBe(1)
  })
})

describe('totalDaysUsedInYear', () => {
  it('sums inclusive days for requests fully inside the year', () => {
    const days = totalDaysUsedInYear([{ date_from: '2026-08-10', date_to: '2026-08-14' }], 2026)
    expect(days).toBe(5)
  })

  it('clips a request spanning into the next year to only that year\'s days', () => {
    const days = totalDaysUsedInYear([{ date_from: '2026-12-29', date_to: '2027-01-02' }], 2026)
    expect(days).toBe(3) // 29, 30, 31 Dec
  })

  it('excludes requests entirely outside the year', () => {
    const days = totalDaysUsedInYear([{ date_from: '2025-06-01', date_to: '2025-06-05' }], 2026)
    expect(days).toBe(0)
  })

  it('returns 0 for an empty list', () => {
    expect(totalDaysUsedInYear([], 2026)).toBe(0)
  })
})

describe('pendingRequestCount', () => {
  it('counts pending requests starting in the given year', () => {
    const count = pendingRequestCount(
      [
        { date_from: '2026-03-01', status: 'pending' },
        { date_from: '2026-05-01', status: 'approved' },
        { date_from: '2025-11-01', status: 'pending' },
      ],
      2026
    )
    expect(count).toBe(1)
  })

  it('returns 0 when nothing is pending', () => {
    expect(pendingRequestCount([{ date_from: '2026-03-01', status: 'approved' }], 2026)).toBe(0)
  })
})

describe('annualDaysUsedInYear', () => {
  it('sums inclusive days for requests fully inside the year', () => {
    const days = annualDaysUsedInYear(
      [{ date_from: '2026-08-10', date_to: '2026-08-14' }],
      2026
    )
    expect(days).toBe(5)
  })

  it('sums across multiple requests', () => {
    const days = annualDaysUsedInYear(
      [
        { date_from: '2026-01-05', date_to: '2026-01-06' },
        { date_from: '2026-08-10', date_to: '2026-08-14' },
      ],
      2026
    )
    expect(days).toBe(7)
  })

  it('clips a request spanning into the next year to only that year\'s days', () => {
    const days = annualDaysUsedInYear(
      [{ date_from: '2026-12-29', date_to: '2027-01-02' }],
      2026
    )
    expect(days).toBe(3) // 29, 30, 31 Dec
  })

  it('excludes requests entirely outside the year', () => {
    const days = annualDaysUsedInYear(
      [{ date_from: '2025-06-01', date_to: '2025-06-05' }],
      2026
    )
    expect(days).toBe(0)
  })

  it('returns 0 for an empty list', () => {
    expect(annualDaysUsedInYear([], 2026)).toBe(0)
  })

  it('prefers annual_leave_days over the full date range when present', () => {
    // 7-day span (5 weekdays + a padding weekend) but only 5 count as annual leave
    const days = annualDaysUsedInYear(
      [{ date_from: '2026-08-08', date_to: '2026-08-14', annual_leave_days: 5 }],
      2026
    )
    expect(days).toBe(5)
  })

  it('mixes annual_leave_days rows with legacy (pre-migration) rows in the same total', () => {
    const days = annualDaysUsedInYear(
      [
        { date_from: '2026-08-08', date_to: '2026-08-14', annual_leave_days: 5 },
        { date_from: '2026-01-05', date_to: '2026-01-06' }, // legacy row, no annual_leave_days
      ],
      2026
    )
    expect(days).toBe(7)
  })

  it('attributes annual_leave_days entirely to the year the request starts in', () => {
    const requests = [{ date_from: '2026-12-29', date_to: '2027-01-02', annual_leave_days: 3 }]
    expect(annualDaysUsedInYear(requests, 2026)).toBe(3)
    expect(annualDaysUsedInYear(requests, 2027)).toBe(0) // not double-counted into the following year
  })
})

describe('upcomingRequests', () => {
  const today = '2026-08-07'

  it('excludes requests that have already fully passed', () => {
    const result = upcomingRequests(
      [{ id: 'past', date_from: '2026-07-01', date_to: '2026-07-03' }],
      today
    )
    expect(result).toHaveLength(0)
  })

  it('includes a request still in progress today', () => {
    const result = upcomingRequests(
      [{ id: 'ongoing', date_from: '2026-08-05', date_to: '2026-08-09' }],
      today
    )
    expect(result.map(r => r.id)).toEqual(['ongoing'])
  })

  it('sorts soonest-first', () => {
    const result = upcomingRequests(
      [
        { id: 'later', date_from: '2026-09-01', date_to: '2026-09-03' },
        { id: 'sooner', date_from: '2026-08-10', date_to: '2026-08-12' },
      ],
      today
    )
    expect(result.map(r => r.id)).toEqual(['sooner', 'later'])
  })

  it('caps to the given limit', () => {
    const requests = Array.from({ length: 8 }, (_, i) => ({
      id: `r${i}`, date_from: `2026-09-0${i + 1}`, date_to: `2026-09-0${i + 1}`,
    }))
    const result = upcomingRequests(requests, today, 3)
    expect(result).toHaveLength(3)
  })
})
