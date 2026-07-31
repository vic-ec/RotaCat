import { describe, it, expect } from 'vitest'
import {
  columnForLeaveCategory, monthsForYear, quartersForYear, datesInMonth,
  buildLeaveByDate, countByColumnPerDate, findLeaveCapacityBreach,
} from './leaveYearGrid'

describe('columnForLeaveCategory', () => {
  it('keeps MO and Registrar as separate columns', () => {
    expect(columnForLeaveCategory('MO')).toBe('MO')
    expect(columnForLeaveCategory('Registrar')).toBe('Registrar')
  })

  it('collapses OT COSMO variants into one column', () => {
    expect(columnForLeaveCategory('COSMOPsych')).toBe('OT_COSMO')
    expect(columnForLeaveCategory('OT_COSMO')).toBe('OT_COSMO')
    expect(columnForLeaveCategory('OT_COSMO_Intern')).toBe('OT_COSMO')
  })

  it('buckets everything else eligible into Other', () => {
    expect(columnForLeaveCategory('COSMO')).toBe('Other')
    expect(columnForLeaveCategory('EC_COSMO_Intern')).toBe('Other')
    expect(columnForLeaveCategory('Consultant')).toBe('Other')
  })

  it('excludes Locum and unrecognised categories', () => {
    expect(columnForLeaveCategory('Locum')).toBeNull()
    expect(columnForLeaveCategory(undefined)).toBeNull()
  })
})

describe('monthsForYear / quartersForYear', () => {
  it('returns 12 months in order', () => {
    const months = monthsForYear(2026)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ year: 2026, month: 1, label: 'January' })
    expect(months[11]).toEqual({ year: 2026, month: 12, label: 'December' })
  })

  it('chunks into 4 quarters of 3 months each', () => {
    const quarters = quartersForYear(2026)
    expect(quarters).toHaveLength(4)
    expect(quarters.map(q => q.months.length)).toEqual([3, 3, 3, 3])
    expect(quarters[0].months.map(m => m.month)).toEqual([1, 2, 3])
    expect(quarters[3].months.map(m => m.month)).toEqual([10, 11, 12])
  })
})

describe('datesInMonth', () => {
  it('returns every date in the month, respecting month length', () => {
    expect(datesInMonth(2026, 2)).toHaveLength(28) // 2026 is not a leap year
    expect(datesInMonth(2026, 8)).toHaveLength(31)
    expect(datesInMonth(2026, 8)[0]).toBe('2026-08-01')
    expect(datesInMonth(2026, 8).at(-1)).toBe('2026-08-31')
  })
})

describe('buildLeaveByDate', () => {
  it('flattens a multi-day request into one entry per day', () => {
    const byDate = buildLeaveByDate(
      [{ profile_id: 'p1', date_from: '2026-08-10', date_to: '2026-08-12' }],
      { yearFrom: 2026, yearTo: 2026 }
    )
    expect([...byDate.keys()]).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
    expect(byDate.get('2026-08-11')).toHaveLength(1)
  })

  it('clips a request that spans outside the requested year range', () => {
    const byDate = buildLeaveByDate(
      [{ profile_id: 'p1', date_from: '2025-12-30', date_to: '2026-01-02' }],
      { yearFrom: 2026, yearTo: 2026 }
    )
    expect([...byDate.keys()]).toEqual(['2026-01-01', '2026-01-02'])
  })
})

describe('countByColumnPerDate', () => {
  it('counts distinct profiles per column per date', () => {
    const byDate = new Map([
      ['2026-08-10', [
        { profile_id: 'p1', category: 'MO' },
        { profile_id: 'p2', category: 'MO' },
        { profile_id: 'p3', category: 'Registrar' },
      ]],
    ])
    const counts = countByColumnPerDate(byDate, e => e.category)
    expect(counts.get('2026-08-10').get('MO')).toBe(2)
    expect(counts.get('2026-08-10').get('Registrar')).toBe(1)
  })

  it('does not double-count the same profile on the same day', () => {
    const byDate = new Map([
      ['2026-08-10', [
        { profile_id: 'p1', category: 'MO' },
        { profile_id: 'p1', category: 'MO' }, // overlapping rows for the same doctor
      ]],
    ])
    const counts = countByColumnPerDate(byDate, e => e.category)
    expect(counts.get('2026-08-10').get('MO')).toBe(1)
  })
})

describe('findLeaveCapacityBreach', () => {
  it('flags a date where adding one more would exceed the cap', () => {
    const existingCountsByDate = new Map([
      ['2026-08-10', new Map([['MO', 2]])],
      ['2026-08-11', new Map([['MO', 1]])],
    ])
    const result = findLeaveCapacityBreach({
      dateFrom: '2026-08-10', dateTo: '2026-08-11', columnKey: 'MO', maxConcurrent: 2, existingCountsByDate,
    })
    expect(result.hasBreach).toBe(true)
    expect(result.breachDates).toEqual(['2026-08-10'])
  })

  it('does not flag when under the cap for every date', () => {
    const existingCountsByDate = new Map([['2026-08-10', new Map([['MO', 1]])]])
    const result = findLeaveCapacityBreach({
      dateFrom: '2026-08-10', dateTo: '2026-08-10', columnKey: 'MO', maxConcurrent: 2, existingCountsByDate,
    })
    expect(result.hasBreach).toBe(false)
  })

  it('treats a date with no existing entries as zero', () => {
    const result = findLeaveCapacityBreach({
      dateFrom: '2026-08-10', dateTo: '2026-08-10', columnKey: 'OT_COSMO', maxConcurrent: 1, existingCountsByDate: new Map(),
    })
    expect(result.hasBreach).toBe(false)
  })
})
