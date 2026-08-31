import { describe, it, expect } from 'vitest'
import {
  specialCountsByDate, specialMonthMarkers, leadingBlanksForMonth, specialMonthStats, specialMonthEntries,
} from './specialPlanner'

function entry(profileId, leaveType, dateFrom, dateTo, status = 'approved', surname = profileId) {
  return { profileId, leaveType, dateFrom, dateTo, status, surname }
}

// 2026-08-10: three doctors on genuine special leave (at the guideline),
// plus one sick and one pending-annual, neither of which the guideline is
// about. 2026-08-11: one doctor only.
const BY_DATE = new Map([
  ['2026-08-10', [
    entry('p1', 'study', '2026-08-10', '2026-08-11'),
    entry('p2', 'conference', '2026-08-10', '2026-08-10'),
    entry('p3', 'maternity', '2026-08-10', '2026-08-10'),
    entry('p4', 'sick', '2026-08-10', '2026-08-10'),
    entry('p5', 'annual', '2026-08-10', '2026-08-10', 'pending'),
  ]],
  ['2026-08-11', [entry('p1', 'study', '2026-08-10', '2026-08-11')]],
])

describe('specialCountsByDate', () => {
  it('counts distinct doctors on genuine special leave only', () => {
    const counts = specialCountsByDate(BY_DATE)
    // 5 entries that day, but sick and pending-annual are not special leave.
    expect(counts.get('2026-08-10')).toBe(3)
    expect(counts.get('2026-08-11')).toBe(1)
  })

  it('does not double-count one doctor with two special-leave rows on a day', () => {
    const byDate = new Map([['2026-08-10', [
      entry('p1', 'study', '2026-08-10', '2026-08-10'),
      entry('p1', 'workshop', '2026-08-10', '2026-08-10'),
    ]]])
    expect(specialCountsByDate(byDate).get('2026-08-10')).toBe(1)
  })
})

describe('specialMonthMarkers', () => {
  const counts = specialCountsByDate(BY_DATE)
  const markers = specialMonthMarkers(2026, 8, counts, new Map([['2026-08-09', "Women's Day"]]))
  const byDate = new Map(markers.map(m => [m.date, m]))

  it('covers every day of the month', () => {
    expect(markers).toHaveLength(31)
  })

  it('flags a day at the 3-doctor guideline, and not one below it', () => {
    expect(byDate.get('2026-08-10').overSoftCap).toBe(true)
    expect(byDate.get('2026-08-11').overSoftCap).toBe(false)
    expect(byDate.get('2026-08-12').count).toBe(0)
  })

  it('carries the public holiday through', () => {
    expect(byDate.get('2026-08-09').isPublicHoliday).toBe(true)
    expect(byDate.get('2026-08-09').publicHolidayName).toBe("Women's Day")
    expect(byDate.get('2026-08-10').isPublicHoliday).toBe(false)
  })

  it('maps counts onto the shared capacity palette, so an equal headcount is an equal colour on both planners', () => {
    expect(byDate.get('2026-08-12').capacityState.key).toBe('available') // 0
    expect(byDate.get('2026-08-11').capacityState.key).toBe('limited') // 1
    expect(byDate.get('2026-08-10').capacityState.key).toBe('at_capacity') // 3, clamped
  })
})

describe('leadingBlanksForMonth', () => {
  it('is Monday-start, so a Saturday 1st needs five blanks before it', () => {
    // 2026-08-01 is a Saturday.
    const markers = specialMonthMarkers(2026, 8, new Map())
    expect(leadingBlanksForMonth(markers)).toBe(5)
  })

  it('returns 0 rather than throwing on an empty month', () => {
    expect(leadingBlanksForMonth([])).toBe(0)
  })
})

describe('specialMonthStats', () => {
  it('counts people and requests, and days above the guideline', () => {
    const stats = specialMonthStats(2026, 8, BY_DATE, specialCountsByDate(BY_DATE))
    expect(stats.people).toBe(5)
    expect(stats.pending).toBe(1) // the pending annual row
    expect(stats.approved).toBe(4)
    expect(stats.pressureDays).toBe(1) // only 2026-08-10
  })

  it('counts a multi-day request once, not once per day', () => {
    const byDate = new Map([
      ['2026-08-10', [entry('p1', 'study', '2026-08-10', '2026-08-12')]],
      ['2026-08-11', [entry('p1', 'study', '2026-08-10', '2026-08-12')]],
      ['2026-08-12', [entry('p1', 'study', '2026-08-10', '2026-08-12')]],
    ])
    const stats = specialMonthStats(2026, 8, byDate, specialCountsByDate(byDate))
    expect(stats.approved).toBe(1)
    expect(stats.people).toBe(1)
  })

  it('is all zeroes for a month with nothing in it', () => {
    const stats = specialMonthStats(2026, 9, BY_DATE, specialCountsByDate(BY_DATE))
    expect(stats).toEqual({ people: 0, approved: 0, pending: 0, pressureDays: 0 })
  })
})

describe('specialMonthEntries', () => {
  it('returns one row per request, sorted by start date then surname', () => {
    const rows = specialMonthEntries(2026, 8, BY_DATE)
    expect(rows).toHaveLength(5)
    expect(rows.map(r => r.profileId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('does not repeat a request that spans several days', () => {
    const byDate = new Map([
      ['2026-08-10', [entry('p1', 'study', '2026-08-10', '2026-08-11')]],
      ['2026-08-11', [entry('p1', 'study', '2026-08-10', '2026-08-11')]],
    ])
    expect(specialMonthEntries(2026, 8, byDate)).toHaveLength(1)
  })

  it('is empty for a month with nothing in it', () => {
    expect(specialMonthEntries(2026, 12, BY_DATE)).toEqual([])
  })
})
