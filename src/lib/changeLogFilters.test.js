import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { changeLogFilterGroups, EMPTY_LOG_FILTERS, logFiltersActive } = await import('./changeLogFilters')
const { rosterDoctorMatchIds, ROSTER_ACTION_OPTIONS, ROLE_FILTER_OPTIONS } = await import('./changeLog')

describe('changeLogFilterGroups', () => {
  it('orders the sections Doctor, Admin, Change type, then the log\'s own, without "All" options', () => {
    const groups = changeLogFilterGroups({
      filters: EMPTY_LOG_FILTERS, setFilters: () => {}, doctorOptions: [], adminOptions: [],
      actionOptions: ROSTER_ACTION_OPTIONS, extra: { label: 'Role', options: ROLE_FILTER_OPTIONS },
    })
    expect(groups.map(g => g.label)).toEqual(['Doctor', 'Admin', 'Change type', 'Role'])
    expect(groups[2].options.some(o => o.value === '')).toBe(false)
    expect(groups[3].options.map(o => o.value)).toEqual(['doctor', 'locum'])
  })
})

describe('logFiltersActive', () => {
  it('is false for empty filters and true once anything is ticked, dated or searched', () => {
    expect(logFiltersActive(EMPTY_LOG_FILTERS)).toBe(false)
    expect(logFiltersActive(EMPTY_LOG_FILTERS, 'ja')).toBe(true)
    expect(logFiltersActive({ ...EMPTY_LOG_FILTERS, actions: new Set(['move']) })).toBe(true)
  })
})

describe('rosterDoctorMatchIds', () => {
  const doctorOptions = [{ value: 'a', role: 'doctor' }, { value: 'b', role: 'locum' }, { value: 'c', role: 'doctor' }]
  it('is null with nothing ticked', () => {
    expect(rosterDoctorMatchIds({ doctorIds: new Set(), roles: new Set(), doctorOptions })).toBeNull()
  })
  it('ticked doctors match as-is; ticked roles alone match everyone with that role', () => {
    expect(rosterDoctorMatchIds({ doctorIds: new Set(['a', 'b']), roles: new Set(), doctorOptions })).toEqual(['a', 'b'])
    expect(rosterDoctorMatchIds({ doctorIds: new Set(), roles: new Set(['doctor']), doctorOptions })).toEqual(['a', 'c'])
  })
  it('both ticked narrows the doctors to those roles, and an empty result matches nothing', () => {
    expect(rosterDoctorMatchIds({ doctorIds: new Set(['a', 'b']), roles: new Set(['locum']), doctorOptions })).toEqual(['b'])
    expect(rosterDoctorMatchIds({ doctorIds: new Set(['a']), roles: new Set(['locum']), doctorOptions })).toHaveLength(1)
    expect(rosterDoctorMatchIds({ doctorIds: new Set(['a']), roles: new Set(['locum']), doctorOptions })[0]).not.toBe('a')
  })
})
