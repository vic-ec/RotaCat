import { describe, it, expect } from 'vitest'
import { annualDaysUsedInYear, upcomingRequests } from './leaveDashboard'

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
