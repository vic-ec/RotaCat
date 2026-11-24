import { describe, it, expect } from 'vitest'
import { roundHalfEven, unavailableDaysInMonth, leaveAdjustedMinimum } from './contractMinimum'

describe('contractMinimum', () => {
  it('rounds halves to even, like Python', () => {
    expect([0.5, 1.5, 2.5, 2.4, 2.6, 147.5].map(roundHalfEven)).toEqual([0, 2, 2, 2, 3, 148])
  })
  it('counts each leave day in the month once', () => {
    expect(unavailableDaysInMonth([
      { date_from: '2026-10-28', date_to: '2026-11-03' },
      { date_from: '2026-11-02', date_to: '2026-11-04' },
      { date_from: '2026-11-29', date_to: '2026-12-05' },
    ], '2026-11-01', '2026-11-30')).toBe(6)
  })
  it('scales the minimum by the share of the month available', () => {
    expect(leaveAdjustedMinimum(220, 0, 30)).toBe(220)
    expect(leaveAdjustedMinimum(220, 10, 30)).toBe(147) // 146.67
    expect(leaveAdjustedMinimum(108, 31, 31)).toBe(0)
    expect(leaveAdjustedMinimum(null, 3, 30)).toBe(0)
  })
})
