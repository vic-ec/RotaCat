import { describe, it, expect } from 'vitest'
import { buildCalendarDays, buildWeeks, buildEntryMap } from './rosterCalendar'

describe('buildCalendarDays', () => {
  it('lists every day of the month as a local YYYY-MM-DD, with its day type', () => {
    const days = buildCalendarDays(2026, 8)
    expect(days).toHaveLength(31)
    expect(days[0]).toEqual({ dateStr: '2026-08-01', dayType: 'weekend', phName: null }) // a Saturday
    expect(days[1]).toEqual({ dateStr: '2026-08-02', dayType: 'weekend', phName: null }) // Sunday
    expect(days[2]).toEqual({ dateStr: '2026-08-03', dayType: 'weekday', phName: null }) // Monday
    expect(days[30].dateStr).toBe('2026-08-31')
  })

  it('a public holiday on a weekend is PH; on a weekday, PH_weekday — with its name', () => {
    const days = buildCalendarDays(2026, 8, { '2026-08-09': "Women's Day", '2026-08-10': 'Public holiday' })
    expect(days.find(d => d.dateStr === '2026-08-09')).toEqual({ dateStr: '2026-08-09', dayType: 'PH', phName: "Women's Day" })
    expect(days.find(d => d.dateStr === '2026-08-10')).toEqual({ dateStr: '2026-08-10', dayType: 'PH_weekday', phName: 'Public holiday' })
  })

  it('knows short months and leap years', () => {
    expect(buildCalendarDays(2027, 2)).toHaveLength(28)
    expect(buildCalendarDays(2028, 2)).toHaveLength(29)
    expect(buildCalendarDays(2026, 11)).toHaveLength(30)
  })
})

describe('buildWeeks', () => {
  it('splits into Monday-to-Sunday weeks, partial at either end of the month', () => {
    const weeks = buildWeeks(buildCalendarDays(2026, 8)) // Sat 1 Aug … Mon 31 Aug
    expect(weeks.map(w => w.length)).toEqual([2, 7, 7, 7, 7, 1])
    expect(weeks[0].map(d => d.dateStr)).toEqual(['2026-08-01', '2026-08-02'])
    expect(weeks[1][0].dateStr).toBe('2026-08-03') // a Monday starts the next
    expect(weeks[5].map(d => d.dateStr)).toEqual(['2026-08-31'])
  })

  it('a month starting on a Monday with 28 days is exactly four full weeks', () => {
    const weeks = buildWeeks(buildCalendarDays(2027, 2))
    expect(weeks.map(w => w.length)).toEqual([7, 7, 7, 7])
    expect(weeks[3][6].dateStr).toBe('2027-02-28')
  })

  it('an empty month has no weeks', () => {
    expect(buildWeeks([])).toEqual([])
  })
})

describe('buildEntryMap', () => {
  const shiftTypes = { st1: 'WD_08', st2: 'WD_22' }

  it('groups entries by date and shift code, in the order given', () => {
    const a = { id: 'a', date: '2026-08-03', shift_type_id: 'st1' }
    const b = { id: 'b', date: '2026-08-03', shift_type_id: 'st1' }
    const c = { id: 'c', date: '2026-08-03', shift_type_id: 'st2' }
    const map = buildEntryMap([a, b, c], shiftTypes)
    expect(map['2026-08-03|WD_08']).toEqual([a, b])
    expect(map['2026-08-03|WD_22']).toEqual([c])
  })

  it('files the consultant row under CONSULTANT (by profile or a legacy free-text name)', () => {
    const byProfile = { id: 'k1', date: '2026-08-03', shift_type_id: 'st1', consultant_profile_id: 'c1' }
    const byName = { id: 'k2', date: '2026-08-04', shift_type_id: 'st1', consultant_name: 'Dr Old' }
    const map = buildEntryMap([byProfile, byName], shiftTypes)
    expect(map['2026-08-03|CONSULTANT']).toEqual([byProfile])
    expect(map['2026-08-04|CONSULTANT']).toEqual([byName])
    expect(map['2026-08-03|WD_08']).toBeUndefined()
  })

  it('an entry whose shift type is unknown lands under UNKNOWN', () => {
    const e = { id: 'x', date: '2026-08-05', shift_type_id: 'gone' }
    expect(buildEntryMap([e], shiftTypes)['2026-08-05|UNKNOWN']).toEqual([e])
  })
})
