import { describe, it, expect } from 'vitest'
import { findHoursWarnings } from './monthlyHours'

const CEILINGS = { full: 246, five_eighths: 118, psych_overtime: 72 }

describe('findHoursWarnings', () => {
  it('flags a doctor already at/over their contract ceiling', () => {
    const profiles = [{ id: 'p1', name: 'Eveline', surname: 'Baerends', contract_type: 'five_eighths' }]
    const hoursByProfile = new Map([['p1', 122]])
    const warnings = findHoursWarnings({ profiles, hoursByProfile, ceilings: CEILINGS })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ profileId: 'p1', hours: 122, ceiling: 118 })
  })

  it('does not flag a doctor under their ceiling', () => {
    const profiles = [{ id: 'p1', name: 'Jane', surname: 'Doe', contract_type: 'full' }]
    const hoursByProfile = new Map([['p1', 200]])
    const warnings = findHoursWarnings({ profiles, hoursByProfile, ceilings: CEILINGS })
    expect(warnings).toHaveLength(0)
  })

  it('reads the ceiling live from the constraints values passed in, not a hardcoded figure', () => {
    const profiles = [{ id: 'p1', name: 'Jane', surname: 'Doe', contract_type: 'full' }]
    const hoursByProfile = new Map([['p1', 200]])
    // Under a lower, updated ceiling the same hours now trip the warning
    const warnings = findHoursWarnings({ profiles, hoursByProfile, ceilings: { ...CEILINGS, full: 190 } })
    expect(warnings).toHaveLength(1)
  })

  it('skips a profile whose contract_type has no known ceiling, rather than erroring', () => {
    const profiles = [{ id: 'p1', name: 'Locum', surname: 'X', contract_type: null }]
    const hoursByProfile = new Map([['p1', 999]])
    const warnings = findHoursWarnings({ profiles, hoursByProfile, ceilings: CEILINGS })
    expect(warnings).toHaveLength(0)
  })

  it('treats a profile with no rostered hours yet as zero, not a crash', () => {
    const profiles = [{ id: 'p1', name: 'Jane', surname: 'Doe', contract_type: 'full' }]
    const warnings = findHoursWarnings({ profiles, hoursByProfile: new Map(), ceilings: CEILINGS })
    expect(warnings).toHaveLength(0)
  })
})
