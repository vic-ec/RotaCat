import { describe, it, expect } from 'vitest'
import { editHint, isEditedEntry } from './rosterEditHint'

const names = { landes: 'Cara Landes', exford: 'David Exford', smith: 'Ivan Smith', venter: 'Anna Venter' }
const nameOf = id => names[id] || null
const base = { id: 'e1', date: '2026-11-23', profile_id: 'exford', is_locum: false, is_manual_override: false }

describe('editHint', () => {
  it('gives an untouched shift no marker', () => {
    expect(isEditedEntry(base)).toBe(false)
    expect(editHint({ entry: base, nameOf })).toBeNull()
  })
  it('names who a cover replaces and why', () => {
    const entry = { ...base, profile_id: null, is_locum: true, locum_name: '[Alli]', vacated_profile_id: 'landes', vacated_reason: 'leave' }
    expect(editHint({ entry, nameOf })).toBe('Alli (locum) covering Cara Landes — leave')
    expect(editHint({ entry, nameOf, leaveType: 'sick' })).toBe('Alli (locum) covering Cara Landes — sick leave')
    expect(editHint({ entry, nameOf, leaveType: 'course' })).toBe('Alli (locum) covering Cara Landes — course / CPD leave')
  })
  it('says what the newest change was', () => {
    const entry = { ...base, profile_id: 'landes', is_manual_override: true }
    expect(editHint({ entry, nameOf, change: { action: 'assign', reason: 'swap', profile_id_before: 'exford' } })).toBe('Cara Landes, swapped with David Exford')
    expect(editHint({ entry, nameOf, change: { action: 'assign', profile_id_before: 'smith' } })).toBe('Cara Landes replaced Ivan Smith')
    expect(editHint({ entry, nameOf, change: { action: 'move', date_before: '2026-11-24' } })).toBe('Cara Landes, moved here from Tue 24 Nov')
    expect(editHint({ entry, nameOf })).toBe('Cara Landes, changed by hand')
  })
  it('adds adjusted times', () => {
    const entry = { ...base, start_time_override: '10:00:00', end_time_override: '20:00:00' }
    expect(editHint({ entry, nameOf })).toMatch(/^David Exford, changed by hand · works 10/)
  })
})
