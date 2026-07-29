import { describe, it, expect } from 'vitest'
import { groupForCategory, saturdaysInRange, groupEntriesByWeekend, computeWeekendPlannerDrift } from './weekendPlanner'

describe('groupForCategory', () => {
  it('maps finer categories down to the 4 rotation groups', () => {
    expect(groupForCategory('MO')).toBe('MO')
    expect(groupForCategory('Registrar')).toBe('Registrar')
    expect(groupForCategory('COSMO')).toBe('COSMO')
    expect(groupForCategory('EC_COSMO')).toBe('COSMO')
    expect(groupForCategory('EC_COSMO_Intern')).toBe('COSMO')
    expect(groupForCategory('Intern')).toBe('COSMO')
    expect(groupForCategory('COSMOPsych')).toBe('COSMOPsych')
    expect(groupForCategory('OT_COSMO')).toBe('COSMOPsych')
    expect(groupForCategory('OT_COSMO_Intern')).toBe('COSMOPsych')
  })

  it('returns null for categories that never rotate weekends', () => {
    expect(groupForCategory('Consultant')).toBeNull()
    expect(groupForCategory('Locum')).toBeNull()
    expect(groupForCategory(null)).toBeNull()
    expect(groupForCategory(undefined)).toBeNull()
  })
})

describe('saturdaysInRange', () => {
  it('lists every Saturday in range starting from a Saturday', () => {
    expect(saturdaysInRange('2026-08-01', '2026-08-22')).toEqual([
      '2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22',
    ])
  })

  it('advances to the first Saturday on or after a non-Saturday start', () => {
    // 2026-08-03 is a Monday
    expect(saturdaysInRange('2026-08-03', '2026-08-16')).toEqual([
      '2026-08-08', '2026-08-15',
    ])
  })

  it('returns an empty list when no Saturday falls in range', () => {
    expect(saturdaysInRange('2026-08-03', '2026-08-04')).toEqual([])
  })
})

describe('groupEntriesByWeekend', () => {
  it('groups entries by weekend then by category group', () => {
    const entries = [
      { id: '1', weekend_saturday: '2026-08-01', profile_id: 'p1', category: 'MO' },
      { id: '2', weekend_saturday: '2026-08-01', profile_id: 'p2', category: 'EC_COSMO_Intern' },
      { id: '3', weekend_saturday: '2026-08-08', profile_id: 'p3', category: 'Registrar' },
    ]
    const grouped = groupEntriesByWeekend(entries)
    expect(grouped.get('2026-08-01').MO).toEqual([entries[0]])
    expect(grouped.get('2026-08-01').COSMO).toEqual([entries[1]])
    expect(grouped.get('2026-08-08').Registrar).toEqual([entries[2]])
  })

  it('drops entries in a category with no rotation group', () => {
    const entries = [{ id: '1', weekend_saturday: '2026-08-01', profile_id: 'p1', category: 'Consultant' }]
    const grouped = groupEntriesByWeekend(entries)
    expect(grouped.size).toBe(0)
  })
})

describe('computeWeekendPlannerDrift', () => {
  const shiftTypeCodes = { 'st-we08': 'WE_08', 'st-we20': 'WE_20', 'st-wd08': 'WD_08' }

  it('finds no drift when the draft matches the planner exactly', () => {
    const rosterEntries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st-we08' },
      { profile_id: 'p2', date: '2026-08-02', shift_type_id: 'st-we20' },
    ]
    const plannerEntries = [
      { weekend_saturday: '2026-08-01', profile_id: 'p1' },
      { weekend_saturday: '2026-08-01', profile_id: 'p2' },
    ]
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([])
  })

  it('flags a doctor added to the planner after the draft was generated', () => {
    const rosterEntries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st-we08' },
    ]
    const plannerEntries = [
      { weekend_saturday: '2026-08-01', profile_id: 'p1' },
      { weekend_saturday: '2026-08-01', profile_id: 'p2' },
    ]
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([
      { saturday: '2026-08-01', added: ['p2'], removed: [] },
    ])
  })

  it('flags a doctor removed from the planner after the draft was generated', () => {
    const rosterEntries = [
      { profile_id: 'p1', date: '2026-08-01', shift_type_id: 'st-we08' },
      { profile_id: 'p2', date: '2026-08-02', shift_type_id: 'st-we20' },
    ]
    const plannerEntries = [
      { weekend_saturday: '2026-08-01', profile_id: 'p1' },
    ]
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([
      { saturday: '2026-08-01', added: [], removed: ['p2'] },
    ])
  })

  it('ignores non-weekend shift codes and locum placeholders (null profile_id)', () => {
    const rosterEntries = [
      { profile_id: null, date: '2026-08-01', shift_type_id: 'st-we08' },
      { profile_id: 'p1', date: '2026-08-03', shift_type_id: 'st-wd08' },
    ]
    const plannerEntries = []
    expect(computeWeekendPlannerDrift(rosterEntries, plannerEntries, shiftTypeCodes)).toEqual([])
  })
})
