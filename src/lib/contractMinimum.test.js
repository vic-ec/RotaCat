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

  it('adds a weekend on leave when it was their weekend, by every second weekend (Van Schalkwyk)', () => {
    // On leave 4–10 Nov; worked the weekend of 24 Oct, so 7 Nov was his.
    const r = monthMinimum({ profile: mo, leave: [{ date_from: '2026-11-04', date_to: '2026-11-10' }], weekendsWorked: new Set(['2026-10-24', '2026-11-21']), ...nov })
    expect(r).toMatchObject({ leaveShifts: 6, weekendLeaveShifts: 1, minimum: 147 }) // 210 × 14/20
  })

  it('does not add a weekend on leave that was not theirs (Van Zyl, 7 Nov)', () => {
    // Worked 31 Oct and 14 Nov: 7 Nov was the weekend off; 28 Nov was his.
    const r = monthMinimum({
      profile: mo,
      leave: [{ date_from: '2026-11-02', date_to: '2026-11-08' }, { date_from: '2026-11-21', date_to: '2026-11-29' }],
      weekendsWorked: new Set(['2026-10-31', '2026-11-14']),
      ...nov,
    })
    expect(r).toMatchObject({ leaveShifts: 11, weekendLeaveShifts: 1 }) // the paper's 11
  })

  it('counts a weekend the planner names them for', () => {
    const r = monthMinimum({ profile: mo, leave: [{ date_from: '2026-11-14', date_to: '2026-11-15' }], plannedWeekends: new Set(['2026-11-14']), ...nov })
    expect(r).toMatchObject({ leaveShifts: 1, weekendLeaveShifts: 1 })
  })

  it('looks two weekends ahead when there is no earlier weekend on record', () => {
    const r = monthMinimum({ profile: mo, leave: [{ date_from: '2026-11-07', date_to: '2026-11-08' }], weekendsWorked: new Set(['2026-11-21']), ...nov })
    expect(r.weekendLeaveShifts).toBe(1)
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

import { hoursBand } from './rosterSummary'
describe('hoursBand', () => {
  it('flags over and under, and never over for a doctor with no maximum', () => {
    expect(hoursBand({ totalHours: 250, minHours: 220, maxHours: 246, adjustedMinHours: 210 })).toBe('over')
    expect(hoursBand({ totalHours: 200, minHours: 220, maxHours: 246, adjustedMinHours: 210 })).toBe('under')
    expect(hoursBand({ totalHours: 215, minHours: 220, maxHours: 246, adjustedMinHours: 210 })).toBeNull()
    expect(hoursBand({ totalHours: 50, minHours: null, maxHours: null, adjustedMinHours: 0 })).toBeNull()
    expect(hoursBand({ totalHours: 100, minHours: 220, maxHours: 246, adjustedMinHours: 210, underTracked: false })).toBeNull()
  })
})
