import { describe, it, expect } from 'vitest'
import { workedNightShiftPreviousDay, isOnApprovedLeave } from './rosterAssignmentEligibility'

const shiftTypes = { 'st-wd22': 'WD_22', 'st-we20': 'WE_20', 'st-phw22': 'PHW_22', 'st-ph20': 'PH_20', 'st-wd08': 'WD_08' }

describe('workedNightShiftPreviousDay', () => {
  it('flags a doctor who worked WD_22 the day before', () => {
    const entries = [{ date: '2026-08-10', profile_id: 'doc-a', shift_type_id: 'st-wd22' }]
    expect(workedNightShiftPreviousDay({ entries, shiftTypes, date: '2026-08-11', profileId: 'doc-a' })).toBe(true)
  })

  it('does not flag a non-night shift the day before', () => {
    const entries = [{ date: '2026-08-10', profile_id: 'doc-a', shift_type_id: 'st-wd08' }]
    expect(workedNightShiftPreviousDay({ entries, shiftTypes, date: '2026-08-11', profileId: 'doc-a' })).toBe(false)
  })

  it('does not flag a night shift two days before', () => {
    const entries = [{ date: '2026-08-09', profile_id: 'doc-a', shift_type_id: 'st-wd22' }]
    expect(workedNightShiftPreviousDay({ entries, shiftTypes, date: '2026-08-11', profileId: 'doc-a' })).toBe(false)
  })

  it('does not flag a different doctor’s night shift', () => {
    const entries = [{ date: '2026-08-10', profile_id: 'doc-b', shift_type_id: 'st-wd22' }]
    expect(workedNightShiftPreviousDay({ entries, shiftTypes, date: '2026-08-11', profileId: 'doc-a' })).toBe(false)
  })

  it('recognises all four night-shift codes', () => {
    for (const code of ['st-wd22', 'st-we20', 'st-phw22', 'st-ph20']) {
      const entries = [{ date: '2026-08-10', profile_id: 'doc-a', shift_type_id: code }]
      expect(workedNightShiftPreviousDay({ entries, shiftTypes, date: '2026-08-11', profileId: 'doc-a' })).toBe(true)
    }
  })
})

describe('isOnApprovedLeave', () => {
  it('flags a date inside an approved leave range', () => {
    const leaveByProfile = { 'doc-a': [['2026-08-05', '2026-08-12']] }
    expect(isOnApprovedLeave({ leaveByProfile, profileId: 'doc-a', date: '2026-08-10' })).toBe(true)
  })

  it('does not flag a date outside the range', () => {
    const leaveByProfile = { 'doc-a': [['2026-08-05', '2026-08-12']] }
    expect(isOnApprovedLeave({ leaveByProfile, profileId: 'doc-a', date: '2026-08-13' })).toBe(false)
  })

  it('does not flag a doctor with no leave entries', () => {
    expect(isOnApprovedLeave({ leaveByProfile: {}, profileId: 'doc-a', date: '2026-08-10' })).toBe(false)
  })
})
