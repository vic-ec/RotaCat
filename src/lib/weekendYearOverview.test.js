import { describe, it, expect } from 'vitest'
import { monthWeekendMarkers, yearWeekendTotals } from './weekendYearOverview'
import { saturdaysInMonth } from './weekendPlanner'

const FULL = {
  MO: [{ profile_id: 'p1' }], Registrar: [{ profile_id: 'p2' }],
  COSMO: [{ profile_id: 'p3' }], COSMOPsych: [{ profile_id: 'p4' }],
}
const PARTIAL = { MO: [{ profile_id: 'p1' }] }

describe('monthWeekendMarkers', () => {
  it('returns one marker per Saturday in the month, with health and gapCount', () => {
    // 2026-08-01 is a Saturday; August 2026 has 5 Saturdays
    const byWeekend = new Map([
      ['2026-08-01', FULL],
      ['2026-08-08', PARTIAL],
    ])
    const markers = monthWeekendMarkers(2026, 8, byWeekend)
    expect(markers.map(m => m.saturday)).toEqual(saturdaysInMonth(2026, 8))

    expect(markers.find(m => m.saturday === '2026-08-01')).toEqual({ saturday: '2026-08-01', health: 'green', gapCount: 0 })
    expect(markers.find(m => m.saturday === '2026-08-08')).toEqual({ saturday: '2026-08-08', health: 'amber', gapCount: 3 })
    expect(markers.find(m => m.saturday === '2026-08-15')).toEqual({ saturday: '2026-08-15', health: 'red', gapCount: 4 })
  })

  it('treats an empty byWeekend map as every weekend red/empty', () => {
    const markers = monthWeekendMarkers(2026, 9, new Map())
    expect(markers.every(m => m.health === 'red' && m.gapCount === 4)).toBe(true)
  })
})

describe('yearWeekendTotals', () => {
  it('counts fully-planned/partial/empty weekends across the whole year', () => {
    const [jan1, jan2] = saturdaysInMonth(2026, 1)
    const byWeekend = new Map([
      [jan1, FULL],
      [jan2, PARTIAL],
    ])
    const totals = yearWeekendTotals(2026, byWeekend)
    expect(totals.fullyPlanned).toBe(1)
    expect(totals.partial).toBe(1)
    expect(totals.empty).toBe(totals.total - 2)
    expect(totals.total).toBeGreaterThan(50) // ~52 weekends/year
  })

  it('returns all-empty totals for a completely empty byWeekend map', () => {
    const totals = yearWeekendTotals(2026, new Map())
    expect(totals.fullyPlanned).toBe(0)
    expect(totals.partial).toBe(0)
    expect(totals.empty).toBe(totals.total)
  })
})
