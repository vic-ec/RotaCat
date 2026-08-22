import { describe, it, expect } from 'vitest'
import {
  pressureDatesInYear, monthDayMarkers, monthSummaryLine, firstPressureRangeInMonth,
  monthTotalCapacityBreakdown, monthPublicHolidayCount, entriesInRange,
  categoryDayCapacityState, monthCapacityMarkers,
} from './annualPlannerOverview'
import { LEAVE_CAPACITY_STATES } from './leaveYearGrid'

const MAX_BY_COLUMN = { MO: 2, Registrar: 1, EC_Intern: 1, OT_Intern: 1 }

describe('pressureDatesInYear', () => {
  it('flags a date where any column is at its cap', () => {
    const counts = new Map([
      ['2026-08-08', new Map([['MO', 2]])], // at MO cap (2)
      ['2026-08-09', new Map([['MO', 1]])], // under cap
    ])
    const pressureDates = pressureDatesInYear(counts, MAX_BY_COLUMN)
    expect(pressureDates.has('2026-08-08')).toBe(true)
    expect(pressureDates.has('2026-08-09')).toBe(false)
  })

  it('flags a date where a column is over its cap (a legacy/edge-case breach)', () => {
    const counts = new Map([['2026-08-08', new Map([['Registrar', 2]])]]) // cap is 1
    expect(pressureDatesInYear(counts, MAX_BY_COLUMN).has('2026-08-08')).toBe(true)
  })

  it('ignores columns with no configured max', () => {
    const counts = new Map([['2026-08-08', new Map([['OT_Intern', 5]])]])
    expect(pressureDatesInYear(counts, { MO: 2 }).has('2026-08-08')).toBe(false)
  })
})

describe('monthDayMarkers', () => {
  it('returns one marker per day of the month with the right flags', () => {
    const approvedByDate = new Map([['2026-08-08', [{ profileId: 'p1' }]]])
    const pendingByDate = new Map([['2026-08-09', [{ profileId: 'p2' }]]])
    const pressureDates = new Set(['2026-08-08'])
    const countByColumnPerDate = new Map([['2026-08-08', new Map([['MO', 2]])], ['2026-08-09', new Map([['Registrar', 1]])]])

    const markers = monthDayMarkers(2026, 8, { approvedByDate, pendingByDate, pressureDates, countByColumnPerDate })
    expect(markers).toHaveLength(31)
    expect(markers[0].date).toBe('2026-08-01')
    expect(markers[30].date).toBe('2026-08-31')

    const aug8 = markers.find(m => m.date === '2026-08-08')
    expect(aug8).toEqual({
      date: '2026-08-08', hasApproved: true, hasPending: false, isPressure: true, isPublicHoliday: false, publicHolidayName: null,
      totalSlots: 2, capacityState: LEAVE_CAPACITY_STATES[2],
    })

    const aug9 = markers.find(m => m.date === '2026-08-09')
    expect(aug9).toEqual({
      date: '2026-08-09', hasApproved: false, hasPending: true, isPressure: false, isPublicHoliday: false, publicHolidayName: null,
      totalSlots: 1, capacityState: LEAVE_CAPACITY_STATES[1],
    })

    const aug1 = markers.find(m => m.date === '2026-08-01')
    expect(aug1).toEqual({
      date: '2026-08-01', hasApproved: false, hasPending: false, isPressure: false, isPublicHoliday: false, publicHolidayName: null,
      totalSlots: 0, capacityState: LEAVE_CAPACITY_STATES[0],
    })
  })

  it('flags a public holiday date (with its name), and defaults to none when publicHolidaysByDate is omitted', () => {
    const approvedByDate = new Map()
    const pendingByDate = new Map()
    const pressureDates = new Set()
    const publicHolidaysByDate = new Map([['2026-08-10', 'Some Holiday']])

    const markers = monthDayMarkers(2026, 8, { approvedByDate, pendingByDate, pressureDates, publicHolidaysByDate })
    expect(markers.find(m => m.date === '2026-08-10').isPublicHoliday).toBe(true)
    expect(markers.find(m => m.date === '2026-08-10').publicHolidayName).toBe('Some Holiday')
    expect(markers.find(m => m.date === '2026-08-11').isPublicHoliday).toBe(false)
    expect(markers.find(m => m.date === '2026-08-11').publicHolidayName).toBeNull()

    const noPhMarkers = monthDayMarkers(2026, 8, { approvedByDate, pendingByDate, pressureDates })
    expect(noPhMarkers.every(m => m.isPublicHoliday === false && m.publicHolidayName === null)).toBe(true)
  })

  it('defaults totalSlots to 0 (available) when countByColumnPerDate is omitted', () => {
    const markers = monthDayMarkers(2026, 8, { approvedByDate: new Map(), pendingByDate: new Map(), pressureDates: new Set() })
    expect(markers.every(m => m.totalSlots === 0 && m.capacityState === LEAVE_CAPACITY_STATES[0])).toBe(true)
  })
})

describe('monthSummaryLine', () => {
  it('combines pressure and pending counts', () => {
    expect(monthSummaryLine({ pressureDayCount: 2, pendingCount: 1 })).toBe('2 pressure days · 1 pending')
  })

  it('singularises a lone pressure day', () => {
    expect(monthSummaryLine({ pressureDayCount: 1, pendingCount: 0 })).toBe('1 pressure day')
  })

  it('shows only pending when there is no pressure', () => {
    expect(monthSummaryLine({ pressureDayCount: 0, pendingCount: 3 })).toBe('3 pending')
  })

  it('falls back to Quiet when there is nothing to flag', () => {
    expect(monthSummaryLine({ pressureDayCount: 0, pendingCount: 0 })).toBe('Quiet')
  })
})

describe('firstPressureRangeInMonth', () => {
  it('finds the first contiguous run of pressure dates', () => {
    const pressureDates = new Set(['2026-08-11', '2026-08-12', '2026-08-13', '2026-08-20'])
    expect(firstPressureRangeInMonth(2026, 8, pressureDates)).toEqual({ from: '2026-08-11', to: '2026-08-13' })
  })

  it('returns null when the month has no pressure days', () => {
    expect(firstPressureRangeInMonth(2026, 8, new Set(['2026-09-01']))).toBeNull()
  })

  it('handles a single-day pressure range', () => {
    expect(firstPressureRangeInMonth(2026, 8, new Set(['2026-08-05']))).toEqual({ from: '2026-08-05', to: '2026-08-05' })
  })
})

describe('monthTotalCapacityBreakdown', () => {
  it('buckets each day by its combined headcount across all categories, ignoring days outside the month', () => {
    const counts = new Map([
      ['2026-08-08', new Map([['MO', 2]])], // 2 of 3
      ['2026-08-09', new Map([['MO', 1], ['Registrar', 1]])], // 2 of 3
      ['2026-08-10', new Map([['MO', 1]])], // 1 of 3
      ['2026-08-11', new Map()], // 0 of 3, not counted
      ['2026-09-01', new Map([['MO', 3]])], // outside August
    ])
    const result = monthTotalCapacityBreakdown(2026, 8, counts)
    expect(result).toEqual([
      { level: 1, days: 1 },
      { level: 2, days: 2 },
      { level: 3, days: 0 },
    ])
  })

  it('clamps a day whose combined total exceeds 3 into the "3 of 3" bucket', () => {
    const counts = new Map([['2026-08-08', new Map([['MO', 2], ['Registrar', 1], ['OT_Intern', 1]])]]) // 4 total
    const result = monthTotalCapacityBreakdown(2026, 8, counts)
    expect(result.find(r => r.level === 3).days).toBe(1)
  })

  it('reports zero days at every level for a quiet month', () => {
    expect(monthTotalCapacityBreakdown(2026, 8, new Map())).toEqual([
      { level: 1, days: 0 },
      { level: 2, days: 0 },
      { level: 3, days: 0 },
    ])
  })
})

describe('monthPublicHolidayCount', () => {
  it('counts public holidays within the month, ignoring dates outside it', () => {
    const publicHolidaysByDate = new Map([
      ['2026-08-10', 'Some Holiday'],
      ['2026-08-24', 'Another Holiday'],
      ['2026-09-01', 'Outside August'],
    ])
    expect(monthPublicHolidayCount(2026, 8, publicHolidaysByDate)).toBe(2)
  })

  it('returns 0 for a month with no public holidays', () => {
    expect(monthPublicHolidayCount(2026, 8, new Map())).toBe(0)
  })
})

describe('entriesInRange', () => {
  const approvedByDate = new Map([
    ['2026-08-11', [{ profileId: 'p1', surname: 'Ahmed', category: 'MO', dateFrom: '2026-08-11', dateTo: '2026-08-13' }]],
    ['2026-08-13', [{ profileId: 'p2', surname: 'Zilla', category: 'Registrar', dateFrom: '2026-08-13', dateTo: '2026-08-13' }]],
  ])
  const pendingByDate = new Map([
    ['2026-08-12', [{ profileId: 'p3', surname: 'Davis', category: 'Intern', dateFrom: '2026-08-12', dateTo: '2026-08-12' }]],
    ['2026-08-11', [{ profileId: 'p1', surname: 'Ahmed', category: 'MO', dateFrom: '2026-08-11', dateTo: '2026-08-13' }]], // same profile also pending elsewhere in range
  ])

  it('returns every distinct profile touching the range, with surname/category/dateFrom/dateTo carried through', () => {
    const entries = entriesInRange('2026-08-11', '2026-08-13', { approvedByDate, pendingByDate })
    expect(entries.find(e => e.surname === 'Ahmed')).toEqual({
      profileId: 'p1', surname: 'Ahmed', category: 'MO', status: 'approved', dateFrom: '2026-08-11', dateTo: '2026-08-13',
    })
  })

  it('carries contractType through too, for callers that need it to label an Intern entry correctly', () => {
    const otApproved = new Map([
      ['2026-08-11', [{ profileId: 'p9', surname: 'CodeSpace', category: 'Intern', contractType: 'Junior_Doctor_Overtime', dateFrom: '2026-08-11', dateTo: '2026-08-11' }]],
    ])
    const entries = entriesInRange('2026-08-11', '2026-08-11', { approvedByDate: otApproved, pendingByDate: new Map() })
    expect(entries[0].contractType).toBe('Junior_Doctor_Overtime')
  })

  it('sorts approved entries before pending ones, even out of alphabetical order', () => {
    const entries = entriesInRange('2026-08-11', '2026-08-13', { approvedByDate, pendingByDate })
    // Zilla (approved) sorts before Davis (pending) despite the alphabet.
    expect(entries.map(e => e.surname)).toEqual(['Ahmed', 'Zilla', 'Davis'])
  })

  it('sorts by surname within each status group', () => {
    const entries = entriesInRange('2026-08-11', '2026-08-13', { approvedByDate, pendingByDate })
    expect(entries.filter(e => e.status === 'approved').map(e => e.surname)).toEqual(['Ahmed', 'Zilla'])
  })

  it('prefers approved status over pending for the same profile', () => {
    const entries = entriesInRange('2026-08-11', '2026-08-13', { approvedByDate, pendingByDate })
    expect(entries.find(e => e.surname === 'Ahmed').status).toBe('approved')
    expect(entries.find(e => e.surname === 'Davis').status).toBe('pending')
  })

  it('returns an empty array when nothing overlaps the range', () => {
    expect(entriesInRange('2026-09-01', '2026-09-05', { approvedByDate, pendingByDate })).toEqual([])
  })
})

describe('categoryDayCapacityState', () => {
  it('reads a cap-1 column as either available or fully at capacity, with no middle state', () => {
    expect(categoryDayCapacityState(0, 1)).toBe(LEAVE_CAPACITY_STATES[0])
    expect(categoryDayCapacityState(1, 1)).toBe(LEAVE_CAPACITY_STATES[3])
  })

  it('reads a cap-2 column\'s half-full day as "limited", not "near capacity"', () => {
    expect(categoryDayCapacityState(1, 2)).toBe(LEAVE_CAPACITY_STATES[1])
    expect(categoryDayCapacityState(2, 2)).toBe(LEAVE_CAPACITY_STATES[3])
  })

  it('reads a cap-4 column\'s 3-of-4 day as "near capacity"', () => {
    expect(categoryDayCapacityState(3, 4)).toBe(LEAVE_CAPACITY_STATES[2])
  })

  it('returns "available" for a column with no configured max', () => {
    expect(categoryDayCapacityState(5, null)).toBe(LEAVE_CAPACITY_STATES[0])
  })
})

describe('monthCapacityMarkers', () => {
  const maxByColumnKey = { MO: 2, Registrar: 1, EC_Intern: 2, OT_Intern: 1 }

  it('reads each day against just the given column\'s own cap', () => {
    const countByColumnPerDate = new Map([
      ['2026-08-10', new Map([['MO', 2], ['Registrar', 1]])],
    ])
    const markers = monthCapacityMarkers(2026, 8, 'MO', { countByColumnPerDate, maxByColumnKey })
    const day10 = markers.find(d => d.date === '2026-08-10')
    expect(day10.capacityState).toBe(LEAVE_CAPACITY_STATES[3]) // MO at its own cap of 2

    const registrarMarkers = monthCapacityMarkers(2026, 8, 'Registrar', { countByColumnPerDate, maxByColumnKey })
    const registrarDay10 = registrarMarkers.find(d => d.date === '2026-08-10')
    expect(registrarDay10.capacityState).toBe(LEAVE_CAPACITY_STATES[3]) // Registrar at its own cap of 1
  })

  it('falls back to the blended combined-headcount reading for "all"', () => {
    const countByColumnPerDate = new Map([
      ['2026-08-10', new Map([['MO', 1], ['Registrar', 1]])],
    ])
    const markers = monthCapacityMarkers(2026, 8, 'all', { countByColumnPerDate, maxByColumnKey })
    const day10 = markers.find(d => d.date === '2026-08-10')
    expect(day10.capacityState).toBe(LEAVE_CAPACITY_STATES[2]) // 2 of 3 combined
  })

  it('carries public holiday info through per day', () => {
    const publicHolidaysByDate = new Map([['2026-08-10', "Women's Day"]])
    const markers = monthCapacityMarkers(2026, 8, 'MO', { countByColumnPerDate: new Map(), maxByColumnKey, publicHolidaysByDate })
    const day10 = markers.find(d => d.date === '2026-08-10')
    expect(day10.isPublicHoliday).toBe(true)
    expect(day10.publicHolidayName).toBe("Women's Day")
  })
})
