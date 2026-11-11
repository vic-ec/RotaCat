import { describe, it, expect } from 'vitest'
import {
  weeksForMonthMondayFirst, isWeekendDate, daysBySlotsUsed, capacityBarLabels,
  WEEKDAY_NAMES_MONDAY_FIRST, WEEKDAY_SHORT_MONDAY_FIRST,
} from './plannerCalendar'
import { formatWeekdayDate } from './dateRange'

describe('weeksForMonthMondayFirst', () => {
  it('pads the first week so day 1 lands on its real weekday, Monday first', () => {
    // 2026-08-01 is a Saturday: five blanks (Mon–Fri) before it.
    const weeks = weeksForMonthMondayFirst(2026, 8)
    expect(weeks[0]).toEqual([null, null, null, null, null, '2026-08-01', '2026-08-02'])
  })

  it('pads the last week with trailing nulls to stay 7 wide', () => {
    // 2026-08-31 is a Monday.
    const weeks = weeksForMonthMondayFirst(2026, 8)
    const lastWeek = weeks.at(-1)
    expect(lastWeek).toHaveLength(7)
    expect(lastWeek[0]).toBe('2026-08-31')
    expect(lastWeek.slice(1)).toEqual([null, null, null, null, null, null])
  })

  it('a month starting on a Monday has no leading blanks, and one ending on a Sunday no trailing ones', () => {
    // June 2026 starts on a Monday; November 2026 ends on a Monday, so
    // use May 2026, which ends on Sunday the 31st.
    expect(weeksForMonthMondayFirst(2026, 6)[0][0]).toBe('2026-06-01')
    const may = weeksForMonthMondayFirst(2026, 5)
    expect(may.at(-1)[6]).toBe('2026-05-31')
    expect(may.every(w => w.length === 7)).toBe(true)
  })

  it('leaves dateRange\'s own Sunday-first weekday table untouched (it maps getDay() for formatting)', () => {
    expect(formatWeekdayDate('2026-08-02')).toBe('Sunday, 2 Aug 2026')
    expect(WEEKDAY_NAMES_MONDAY_FIRST[0]).toBe('Monday')
    expect(WEEKDAY_SHORT_MONDAY_FIRST).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])
  })
})

describe('isWeekendDate', () => {
  it('is true for a Saturday and a Sunday only', () => {
    expect(isWeekendDate('2026-08-01')).toBe(true) // Sat
    expect(isWeekendDate('2026-08-02')).toBe(true) // Sun
    expect(isWeekendDate('2026-08-03')).toBe(false) // Mon
  })
})

describe('daysBySlotsUsed', () => {
  it('buckets every day of the month by the count the caller supplies, with 3+ folded into the top level', () => {
    const used = { '2026-08-10': 1, '2026-08-11': 2, '2026-08-12': 3, '2026-08-13': 5 }
    expect(daysBySlotsUsed(2026, 8, d => used[d] ?? 0)).toEqual([
      { level: 0, days: 27 }, { level: 1, days: 1 }, { level: 2, days: 1 }, { level: 3, days: 2 },
    ])
  })

  it('always returns every level, zero days included', () => {
    expect(daysBySlotsUsed(2026, 2, () => 0)).toEqual([
      { level: 0, days: 28 }, { level: 1, days: 0 }, { level: 2, days: 0 }, { level: 3, days: 0 },
    ])
  })

  it('reproduces the reference month: 7 / 3 / 14 / 7 days at 0 / 1 / 2 / 3+ used', () => {
    // 31 days: the first 7 free, the next 3 at one slot, 14 at two, 7 full.
    const used = d => { const n = Number(d.slice(-2)); return n <= 7 ? 0 : n <= 10 ? 1 : n <= 24 ? 2 : 3 }
    expect(daysBySlotsUsed(2026, 8, used).map(b => b.days)).toEqual([7, 3, 14, 7])
  })
})

describe('capacityBarLabels', () => {
  it('reads "0 of 3 used", "1 of 3", "2 of 3", "full"', () => {
    expect(capacityBarLabels(3)).toEqual(['0 of 3 used', '1 of 3', '2 of 3', 'full'])
  })
})
