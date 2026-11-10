import { describe, it, expect } from 'vitest'
import {
  columnForLeaveCategory, labelForLeaveCategory, monthsForYear, quartersForYear, datesInMonth, weeksForMonth,
  buildLeaveByDate, countByColumnPerDate, LEAVE_CAPACITY_COLUMNS,
  totalLeaveSlotsForDate, capacityStateForCount, totalLeaveCeiling, LEAVE_CAPACITY_STATES,
} from './leaveYearGrid'

describe('columnForLeaveCategory', () => {
  it('keeps MO and Registrar as separate columns', () => {
    expect(columnForLeaveCategory('MO')).toBe('MO')
    expect(columnForLeaveCategory('Registrar')).toBe('Registrar')
  })

  it('resolves the ambiguous COSMO/Intern categories to EC_Intern by default (no OT contract type)', () => {
    expect(columnForLeaveCategory('COSMO')).toBe('EC_Intern')
    expect(columnForLeaveCategory('EC_Intern')).toBe('EC_Intern')
    expect(columnForLeaveCategory('Intern')).toBe('EC_Intern')
  })

  it('collapses OT Intern variants into one column', () => {
    expect(columnForLeaveCategory('OT_Intern')).toBe('OT_Intern')
  })

  // COSMOPsych/EC_COSMO_Intern/OT_COSMO_Intern were retired from the
  // staff_category enum in Aug 2026 (folded into Intern/EC_Intern/
  // OT_Intern, with every existing row rewritten by that migration) — a
  // raw category value can never be one of these again.
  it('returns null for the retired COSMO-named category values', () => {
    expect(columnForLeaveCategory('COSMOPsych')).toBeNull()
    expect(columnForLeaveCategory('EC_COSMO_Intern')).toBeNull()
    expect(columnForLeaveCategory('OT_COSMO_Intern')).toBeNull()
  })

  it('buckets Consultant into Other', () => {
    expect(columnForLeaveCategory('Consultant')).toBe('Other')
  })

  it('excludes Locum and unrecognised categories', () => {
    expect(columnForLeaveCategory('Locum')).toBeNull()
    expect(columnForLeaveCategory(undefined)).toBeNull()
  })
})

describe('labelForLeaveCategory', () => {
  it('returns the friendly column label for a raw category', () => {
    expect(labelForLeaveCategory('MO')).toBe('MO')
    expect(labelForLeaveCategory('EC_Intern')).toBe('EC Intern')
    expect(labelForLeaveCategory('OT_Intern')).toBe('OT Intern')
    expect(labelForLeaveCategory('Consultant')).toBe('Consultant')
  })

  it('falls back to the raw category for anything unrecognised', () => {
    expect(labelForLeaveCategory('Locum')).toBe('Locum')
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

describe('weeksForMonth', () => {
  it('pads the first week so day 1 lands on its real weekday', () => {
    // 2026-08-01 is a Saturday
    const weeks = weeksForMonth(2026, 8)
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-08-01'])
  })

  it('pads the last week with trailing nulls to stay 7 wide', () => {
    // 2026-08-31 is a Monday
    const weeks = weeksForMonth(2026, 8)
    const lastWeek = weeks.at(-1)
    expect(lastWeek).toHaveLength(7)
    expect(lastWeek[1]).toBe('2026-08-31')
    expect(lastWeek.slice(2)).toEqual([null, null, null, null, null])
  })

  it('every week is exactly 7 cells and every real date appears exactly once', () => {
    const weeks = weeksForMonth(2026, 2)
    expect(weeks.every(w => w.length === 7)).toBe(true)
    const flat = weeks.flat().filter(Boolean)
    expect(flat).toEqual(datesInMonth(2026, 2))
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
    const counts = countByColumnPerDate(byDate, e => columnForLeaveCategory(e.category))
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
    const counts = countByColumnPerDate(byDate, e => columnForLeaveCategory(e.category))
    expect(counts.get('2026-08-10').get('MO')).toBe(1)
  })

  it('accepts a columnKeyOf callback that resolves the column directly, bypassing columnForLeaveCategory', () => {
    const byDate = new Map([
      ['2026-08-10', [{ profile_id: 'p1', resolvedColumn: 'EC_Intern' }]],
    ])
    const counts = countByColumnPerDate(byDate, e => e.resolvedColumn)
    expect(counts.get('2026-08-10').get('EC_Intern')).toBe(1)
  })
})

// The breach checks themselves (per-column cap, then the shared full-time
// pool) now run server-side in the annual_leave_capacity RPC — see
// migration 20261110120000 and leaveRequests.test.js for the JS side.
describe('LEAVE_CAPACITY_COLUMNS defaults', () => {
  it('fall back to the live limits — MO 2, Registrar 2, EC Intern 2, OT Intern 1', () => {
    expect(Object.fromEntries(LEAVE_CAPACITY_COLUMNS.map(c => [c.key, c.defaultMax]))).toEqual({
      MO: 2, Registrar: 2, EC_Intern: 2, OT_Intern: 1,
    })
  })
})

describe('totalLeaveCeiling', () => {
  it('adds every non-full-time column\'s own max on top of the full-time combined cap', () => {
    expect(totalLeaveCeiling(2, { OT_Intern: 1 })).toBe(3)
  })

  it('falls back to a column\'s defaultMax when it is missing from maxByColumnKey', () => {
    expect(totalLeaveCeiling(2, {})).toBe(3) // OT_Intern defaults to 1
  })
})

describe('totalLeaveSlotsForDate', () => {
  it('sums every capacity column for a date', () => {
    const counts = new Map([['2026-08-10', new Map([['MO', 2], ['Registrar', 1], ['OT_Intern', 1]])]])
    expect(totalLeaveSlotsForDate('2026-08-10', counts)).toBe(4)
  })

  it('returns 0 for a date with nothing on record', () => {
    expect(totalLeaveSlotsForDate('2026-08-10', new Map())).toBe(0)
  })
})

describe('capacityStateForCount', () => {
  it('maps 0/1/2 to available/limited/near_capacity', () => {
    expect(capacityStateForCount(0)).toBe(LEAVE_CAPACITY_STATES[0])
    expect(capacityStateForCount(1)).toBe(LEAVE_CAPACITY_STATES[1])
    expect(capacityStateForCount(2)).toBe(LEAVE_CAPACITY_STATES[2])
  })

  it('clamps 3 and anything above it to at_capacity', () => {
    expect(capacityStateForCount(3)).toBe(LEAVE_CAPACITY_STATES[3])
    expect(capacityStateForCount(4)).toBe(LEAVE_CAPACITY_STATES[3])
  })
})
