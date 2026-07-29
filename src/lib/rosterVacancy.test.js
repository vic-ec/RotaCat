import { describe, it, expect } from 'vitest'
import { findSameDayConflict } from './rosterVacancy'

describe('findSameDayConflict', () => {
  it('finds a different entry for the same doctor on the same date', () => {
    const entries = [
      { id: 'e1', date: '2026-08-10', profile_id: 'doc-b', shift_type_id: 'wd15' },
      { id: 'e2', date: '2026-08-10', profile_id: 'doc-a', shift_type_id: 'wd08' },
    ]
    const conflict = findSameDayConflict({ entries, date: '2026-08-10', profileId: 'doc-b', excludeEntryId: 'e2' })
    expect(conflict).toEqual(entries[0])
  })

  it('does not flag the entry being vacated itself as its own conflict', () => {
    const entries = [
      { id: 'e1', date: '2026-08-10', profile_id: 'doc-b', shift_type_id: 'wd15' },
    ]
    const conflict = findSameDayConflict({ entries, date: '2026-08-10', profileId: 'doc-b', excludeEntryId: 'e1' })
    expect(conflict).toBeNull()
  })

  it('does not flag a different date as a conflict', () => {
    const entries = [
      { id: 'e1', date: '2026-08-11', profile_id: 'doc-b', shift_type_id: 'wd15' },
    ]
    const conflict = findSameDayConflict({ entries, date: '2026-08-10', profileId: 'doc-b', excludeEntryId: 'e2' })
    expect(conflict).toBeNull()
  })

  it('ignores vacant/locum-placeholder entries (profile_id null)', () => {
    const entries = [
      { id: 'e1', date: '2026-08-10', profile_id: null, shift_type_id: 'wd15' },
    ]
    const conflict = findSameDayConflict({ entries, date: '2026-08-10', profileId: 'doc-b', excludeEntryId: 'e2' })
    expect(conflict).toBeNull()
  })
})
