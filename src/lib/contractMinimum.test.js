import { describe, it, expect } from 'vitest'
import { roundHalfEven, unavailableDaysInMonth, leaveAdjustedMinimum } from './contractMinimum'

describe('contractMinimum', () => {
  it('rounds halves to even, like Python', () => {
    expect([0.5, 1.5, 2.5, 2.4, 2.6, 147.5].map(roundHalfEven)).toEqual([0, 2, 2, 2, 3, 148])
  })
  it('counts each leave day in the month once', () => {
    expect(unavailableDaysInMonth([
      { date_from: '2026-10-28', date_to: '2026-11-03' },
      { date_from: '2026-11-02', date_to: '2026-11-04' },
      { date_from: '2026-11-29', date_to: '2026-12-05' },
    ], '2026-11-01', '2026-11-30')).toBe(6)
  })
  it('scales the minimum by the share of the month available', () => {
    expect(leaveAdjustedMinimum(220, 0, 30)).toBe(220)
    expect(leaveAdjustedMinimum(220, 10, 30)).toBe(147) // 146.67
    expect(leaveAdjustedMinimum(108, 31, 31)).toBe(0)
    expect(leaveAdjustedMinimum(null, 3, 30)).toBe(0)
  })
})

import { monthMinimum } from './contractMinimum'

describe('monthMinimum', () => {
  const nov = { monthStart: '2026-11-01', monthEnd: '2026-11-30' }
  const mo = { id: 'm', category: 'MO', min_hours: 220 }

  it('holds a full month to the engine floor: 220 → 210, 108 → 103, 64 → 61', () => {
    expect(monthMinimum({ profile: mo, ...nov }).minimum).toBe(210)
    expect(monthMinimum({ profile: { ...mo, min_hours: 108 }, ...nov }).minimum).toBe(103)
    expect(monthMinimum({ profile: { ...mo, min_hours: 64 }, ...nov }).minimum).toBe(61)
  })

  it('takes leave off pro rata (Buntting, 9 days of November)', () => {
    const r = monthMinimum({ profile: mo, leave: [{ date_from: '2026-11-07', date_to: '2026-11-15' }], ...nov })
    expect(r).toMatchObject({ minimum: 147, awayDays: 9, notInEcDays: 0 }) // 210 × 21/30
  })

  it('does not count days before In EC from, or after Active until', () => {
    expect(monthMinimum({ profile: { ...mo, ec_start_date: '2026-12-01' }, ...nov }).minimum).toBe(0)
    expect(monthMinimum({ profile: { ...mo, ec_start_date: '2026-11-16' }, ...nov })).toMatchObject({ minimum: 105, notInEcDays: 15 })
    expect(monthMinimum({ profile: { ...mo, scheduled_inactive_date: '2026-11-15' }, ...nov }).minimum).toBe(105)
  })

  it('uses rotations for interns and registrars: no rotation, no minimum', () => {
    const intern = { id: 'i', category: 'Intern', min_hours: 220 }
    const ec = [{ rotation_type: 'EC', start_date: '2026-10-01', end_date: '2026-12-31' }]
    expect(monthMinimum({ profile: intern, rotations: ec, monthStart: '2026-01-01', monthEnd: '2026-01-31' }).minimum).toBe(0)
    expect(monthMinimum({ profile: intern, rotations: ec, ...nov }).minimum).toBe(210)
  })

  it('takes the band from the rotation covering the 1st, as the engine does', () => {
    const intern = { id: 'i', category: 'Intern', min_hours: 220 }
    const ot = [{ rotation_type: 'OT', start_date: '2026-01-01', end_date: '2026-12-31' }]
    expect(monthMinimum({ profile: intern, rotations: ot, ...nov })).toMatchObject({ contracted: 64, minimum: 61 })
  })

  it('falls back to the profile for an intern with no rotations at all', () => {
    expect(monthMinimum({ profile: { id: 'i', category: 'Intern', min_hours: 220 }, ...nov }).minimum).toBe(210)
  })
})
