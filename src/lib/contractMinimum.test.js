import { describe, it, expect } from 'vitest'
import { roundHalfEven, monthMinimum, isUnderHoursTracked } from './contractMinimum'

describe('roundHalfEven', () => {
  it('rounds halves to even, like Python', () => {
    expect([0.5, 1.5, 2.5, 2.4, 2.6, 157.5].map(roundHalfEven)).toEqual([0, 2, 2, 2, 3, 158])
  })
})

describe('monthMinimum', () => {
  const nov = { monthStart: '2026-11-01', monthEnd: '2026-11-30' } // 21 weekdays
  const mo = { id: 'm', category: 'MO', contract_type: 'full', min_hours: 220 }

  it('holds a full month to the engine floor: 220 → 210, 108 → 103, 64 → 61', () => {
    expect(monthMinimum({ profile: mo, ...nov }).minimum).toBe(210)
    expect(monthMinimum({ profile: { ...mo, contract_type: 'five_eighths', min_hours: 108 }, ...nov }).minimum).toBe(103)
    expect(monthMinimum({ profile: { ...mo, contract_type: 'Junior_Doctor_Overtime', min_hours: 64 }, ...nov }).minimum).toBe(61)
  })

  it('credits leave per weekday, as shifts of the 20 a full-time month expects (Barnes)', () => {
    const r = monthMinimum({ profile: mo, leave: [{ date_from: '2026-11-09', date_to: '2026-11-20' }], ...nov })
    expect(r).toMatchObject({ minimum: 105, leaveShifts: 10, leaveDays: 12, expectedShifts: 20 })
  })

  it('ignores weekend days on leave (Buntting, 7–15 Nov: 5 weekdays)', () => {
    const r = monthMinimum({ profile: mo, leave: [{ date_from: '2026-11-07', date_to: '2026-11-15' }], ...nov })
    expect(r).toMatchObject({ minimum: 158, leaveShifts: 5 }) // 210 × 15/20 = 157.5
  })

  it('uses 10 shifts for ⅝ (Baerends, 2 weekdays)', () => {
    const r = monthMinimum({ profile: { ...mo, contract_type: 'five_eighths', min_hours: 108 }, leave: [{ date_from: '2026-11-11', date_to: '2026-11-12' }], ...nov })
    expect(r.minimum).toBe(82) // 103 × 8/10 = 82.4
  })

  it('does not count leave twice on days a doctor overlaps two requests', () => {
    const r = monthMinimum({ profile: mo, leave: [{ date_from: '2026-11-09', date_to: '2026-11-11' }, { date_from: '2026-11-10', date_to: '2026-11-13' }], ...nov })
    expect(r.leaveShifts).toBe(5)
  })

  it('does not count days before In EC from, or after Active until', () => {
    expect(monthMinimum({ profile: { ...mo, ec_start_date: '2026-12-01' }, ...nov }).minimum).toBe(0)
    expect(monthMinimum({ profile: { ...mo, ec_start_date: '2026-11-16' }, ...nov })).toMatchObject({ minimum: 110, notInEcDays: 15 })
    expect(monthMinimum({ profile: { ...mo, scheduled_inactive_date: '2026-11-15' }, ...nov }).minimum).toBe(100)
  })

  it('uses rotations for interns and registrars: no rotation, no minimum', () => {
    const intern = { id: 'i', category: 'Intern', contract_type: 'full', min_hours: 220 }
    const ec = [{ rotation_type: 'EC', start_date: '2026-10-01', end_date: '2026-12-31' }]
    expect(monthMinimum({ profile: intern, rotations: ec, monthStart: '2026-01-01', monthEnd: '2026-01-31' }).minimum).toBe(0)
    expect(monthMinimum({ profile: intern, rotations: ec, ...nov }).minimum).toBe(210)
  })

  it('takes the band and shift count from the rotation covering the 1st, as the engine does', () => {
    const intern = { id: 'i', category: 'Intern', contract_type: 'full', min_hours: 220 }
    const ot = [{ rotation_type: 'OT', start_date: '2026-01-01', end_date: '2026-12-31' }]
    expect(monthMinimum({ profile: intern, rotations: ot, ...nov })).toMatchObject({ contracted: 64, minimum: 61, expectedShifts: 6 })
  })

  it('falls back to the profile for an intern with no rotations at all', () => {
    expect(monthMinimum({ profile: { id: 'i', category: 'Intern', contract_type: 'full', min_hours: 220 }, ...nov }).minimum).toBe(210)
  })
})

describe('isUnderHoursTracked', () => {
  it('checks under-hours from November 2026, when absences started being recorded in the app', () => {
    expect(isUnderHoursTracked(2026, 10)).toBe(false)
    expect(isUnderHoursTracked(2026, 11)).toBe(true)
    expect(isUnderHoursTracked(2027, 1)).toBe(true)
  })
})
