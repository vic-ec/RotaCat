import { describe, it, expect } from 'vitest'
import { formatWeekdayDate, formatShortDateRange, formatTimestampDate } from './dateRange'

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

describe('formatShortDateRange', () => {
  it('formats a single day as "d MMM"', () => {
    expect(formatShortDateRange('2026-08-15', '2026-08-15')).toBe('15 Aug')
  })

  it('formats a range within the same month as "d–d MMM"', () => {
    expect(formatShortDateRange('2026-08-11', '2026-08-15')).toBe('11–15 Aug')
  })

  it('formats a range crossing a month boundary as "d MMM–d MMM"', () => {
    expect(formatShortDateRange('2026-08-28', '2026-09-03')).toBe('28 Aug–3 Sep')
  })
})

describe('formatTimestampDate', () => {
  it('renders an ISO timestamp as day, abbreviated month, year', () => {
    expect(formatTimestampDate('2026-08-19T10:04:00Z')).toBe('19 Aug 2026')
  })

  it('does not fall back to the device locale ordering', () => {
    // A bare toLocaleDateString() gives "8/19/2026" on a US-locale device
    expect(formatTimestampDate('2026-08-19T10:04:00Z')).not.toMatch(/\//)
  })

  it('returns an empty string for a missing or unparseable value', () => {
    expect(formatTimestampDate(null)).toBe('')
    expect(formatTimestampDate(undefined)).toBe('')
    expect(formatTimestampDate('not a date')).toBe('')
  })
})
