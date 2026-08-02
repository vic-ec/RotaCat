import { describe, it, expect } from 'vitest'
import { formatWeekdayDate } from './dateRange'

describe('formatWeekdayDate', () => {
  it('formats as "Weekday, d MMM YYYY"', () => {
    expect(formatWeekdayDate('2026-08-10')).toBe('Monday, 10 Aug 2026')
  })

  it('does not zero-pad the day of month', () => {
    expect(formatWeekdayDate('2026-08-05')).toBe('Wednesday, 5 Aug 2026')
  })

  it('handles December correctly (month index boundary)', () => {
    expect(formatWeekdayDate('2026-12-25')).toBe('Friday, 25 Dec 2026')
  })
})
