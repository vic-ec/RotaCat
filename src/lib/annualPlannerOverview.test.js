import { describe, it, expect } from 'vitest'
import {
  pressureDatesInYear, monthDayMarkers, monthSummaryLine, firstPressureRangeInMonth,
  monthCapacityWarningsByColumn, entriesInRange,
} from './annualPlannerOverview'

const MAX_BY_COLUMN = { MO: 2, Registrar: 1, EC_COSMO: 1, OT_COSMO: 1 }

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
    const counts = new Map([['2026-08-08', new Map([['OT_COSMO', 5]])]])
    expect(pressureDatesInYear(counts, { MO: 2 }).has('2026-08-08')).toBe(false)
  })
})

describe('monthDayMarkers', () => {
  it('returns one marker per day of the month with the right flags', () => {
    const approvedByDate = new Map([['2026-08-08', [{ profileId: 'p1' }]]])
    const pendingByDate = new Map([['2026-08-09', [{ profileId: 'p2' }]]])
    const pressureDates = new Set(['2026-08-08'])

    const markers = monthDayMarkers(2026, 8, { approvedByDate, pendingByDate, pressureDates })
    expect(markers).toHaveLength(31)
    expect(markers[0].date).toBe('2026-08-01')
    expect(markers[30].date).toBe('2026-08-31')

    const aug8 = markers.find(m => m.date === '2026-08-08')
    expect(aug8).toEqual({ date: '2026-08-08', hasApproved: true, hasPending: false, isPressure: true })

    const aug9 = markers.find(m => m.date === '2026-08-09')
    expect(aug9).toEqual({ date: '2026-08-09', hasApproved: false, hasPending: true, isPressure: false })

    const aug1 = markers.find(m => m.date === '2026-08-01')
    expect(aug1).toEqual({ date: '2026-08-01', hasApproved: false, hasPending: false, isPressure: false })
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

describe('monthCapacityWarningsByColumn', () => {
  it('counts at-cap days per column within the month, ignoring days outside it', () => {
    const counts = new Map([
      ['2026-08-08', new Map([['MO', 2]])],
      ['2026-08-09', new Map([['MO', 2]])],
      ['2026-09-01', new Map([['MO', 2]])], // outside August
      ['2026-08-10', new Map([['Registrar', 1]])],
    ])
    const result = monthCapacityWarningsByColumn(2026, 8, counts, MAX_BY_COLUMN)
    expect(result.find(r => r.key === 'MO').days).toBe(2)
    expect(result.find(r => r.key === 'Registrar').days).toBe(1)
    expect(result.find(r => r.key === 'EC_COSMO').days).toBe(0)
  })
})

describe('entriesInRange', () => {
  const approvedByDate = new Map([
    ['2026-08-11', [{ profileId: 'p1', surname: 'Ahmed' }]],
    ['2026-08-13', [{ profileId: 'p2', surname: 'Brown' }]],
  ])
  const pendingByDate = new Map([
    ['2026-08-12', [{ profileId: 'p3', surname: 'Davis' }]],
    ['2026-08-11', [{ profileId: 'p1', surname: 'Ahmed' }]], // same profile also pending elsewhere in range
  ])

  it('returns every distinct profile touching the range, sorted by surname', () => {
    const entries = entriesInRange('2026-08-11', '2026-08-13', { approvedByDate, pendingByDate })
    expect(entries.map(e => e.surname)).toEqual(['Ahmed', 'Brown', 'Davis'])
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
