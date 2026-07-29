import { describe, it, expect } from 'vitest'
import { findSupervisionBreaches, checkAnnualBalance, checkFiveEighthsCeiling } from './leaveApprovals'

describe('findSupervisionBreaches', () => {
  it('flags a shift that would drop below the supervision floor', () => {
    const breaches = findSupervisionBreaches({
      profileCategory: 'MO',
      minSupervision: 1,
      assignedSupervisionShifts: [
        { date: '2026-08-10', shiftTypeId: 'wd08', remainingSupervisors: 0 },
      ],
    })
    expect(breaches).toHaveLength(1)
  })

  it('does not flag when another MO/Registrar remains on the shift', () => {
    const breaches = findSupervisionBreaches({
      profileCategory: 'MO',
      minSupervision: 1,
      assignedSupervisionShifts: [
        { date: '2026-08-10', shiftTypeId: 'wd08', remainingSupervisors: 1 },
      ],
    })
    expect(breaches).toHaveLength(0)
  })

  it('never flags for a category that does not count toward supervision', () => {
    const breaches = findSupervisionBreaches({
      profileCategory: 'COSMO',
      minSupervision: 1,
      assignedSupervisionShifts: [
        { date: '2026-08-10', shiftTypeId: 'wd08', remainingSupervisors: 0 },
      ],
    })
    expect(breaches).toHaveLength(0)
  })
})

describe('checkAnnualBalance', () => {
  it('flags when the request would take the balance negative', () => {
    const result = checkAnnualBalance({ daysAllotted: 22, daysAlreadyApproved: 20, daysRequested: 5 })
    expect(result.wouldGoNegative).toBe(true)
    expect(result.remainingAfter).toBe(-3)
  })

  it('does not flag when balance stays non-negative (clean case)', () => {
    const result = checkAnnualBalance({ daysAllotted: 22, daysAlreadyApproved: 5, daysRequested: 5 })
    expect(result.wouldGoNegative).toBe(false)
    expect(result.remainingAfter).toBe(12)
  })

  it('skips gracefully when there is no balance row for that profile/year', () => {
    const result = checkAnnualBalance({ daysAllotted: null, daysAlreadyApproved: 20, daysRequested: 5 })
    expect(result.skipped).toBe(true)
  })

  it('editing days_allotted changes whether the warning fires', () => {
    const before = checkAnnualBalance({ daysAllotted: 22, daysAlreadyApproved: 20, daysRequested: 5 })
    const after = checkAnnualBalance({ daysAllotted: 30, daysAlreadyApproved: 20, daysRequested: 5 })
    expect(before.wouldGoNegative).toBe(true)
    expect(after.wouldGoNegative).toBe(false)
  })
})

describe('checkFiveEighthsCeiling', () => {
  it('flags a five_eighths doctor already at/over their ceiling', () => {
    const result = checkFiveEighthsCeiling({ contractType: 'five_eighths', alreadyRosteredHours: 122, maxHours: 118 })
    expect(result.flagged).toBe(true)
  })

  it('does not flag a five_eighths doctor under their ceiling (clean case)', () => {
    const result = checkFiveEighthsCeiling({ contractType: 'five_eighths', alreadyRosteredHours: 90, maxHours: 118 })
    expect(result.flagged).toBe(false)
  })

  it('never flags a full-time or psych_overtime contract', () => {
    const result = checkFiveEighthsCeiling({ contractType: 'full', alreadyRosteredHours: 300, maxHours: 246 })
    expect(result.flagged).toBe(false)
  })
})
