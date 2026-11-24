import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import { findSameDayConflict, entryAbsence, absenceSummary, isEntryOnLeave, VACANCY_LEAVE_TYPE_OPTIONS, isNoCoverRow, NO_COVER_PATCH, entrySnapshot } from './rosterVacancy'
import { mergeLeaveRanges, leaveRangeOn } from './approvedLeave'
import { rosterChangeDetail } from './changeLog'

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

const LEAVE = { 'doc-a': [['2026-11-20', '2026-11-21', 'sick', 'leave-1']], 'doc-c': [['2026-11-20', '2026-11-20', null, null]] }

describe('entryAbsence', () => {
  it('is null for an ordinary shift', () => {
    expect(entryAbsence({ profile_id: 'doc-b', date: '2026-11-20' }, LEAVE)).toBeNull()
  })

  it('a doctor taken off a shift is kept as a vacated absence, whoever covers it now', () => {
    const covered = entryAbsence({ profile_id: 'doc-b', date: '2026-11-20', vacated_profile_id: 'doc-a', vacated_reason: 'leave', vacated_leave_request_id: 'leave-1', vacated_by: 'admin-1' }, LEAVE)
    expect(covered).toMatchObject({ kind: 'vacated', profileId: 'doc-a', reason: 'leave', open: false, byId: 'admin-1' })
    // No cover: the doctor is off and nobody is wanted in their place —
    // not an open slot, so nothing to draw beside the struck name.
    const noCover = entryAbsence({ profile_id: null, is_locum: false, date: '2026-11-20', vacated_profile_id: 'doc-a', vacated_reason: 'no_show' }, LEAVE)
    expect(noCover).toMatchObject({ kind: 'vacated', reason: 'no_show', open: false, noCover: true })
    // An opened shift is an open locum slot ("[ ]"), still open.
    const openSlot = entryAbsence({ profile_id: null, is_locum: true, locum_name: '[ ]', date: '2026-11-20', vacated_profile_id: 'doc-a', vacated_reason: 'leave' }, LEAVE)
    expect(openSlot.open).toBe(true)
    const locum = entryAbsence({ profile_id: null, is_locum: true, locum_name: '[Marsh]', date: '2026-11-20', vacated_profile_id: 'doc-a', vacated_reason: 'leave' }, LEAVE)
    expect(locum.open).toBe(false)
  })

  it('a plain swap is not an absence', () => {
    expect(entryAbsence({ profile_id: 'doc-b', date: '2026-11-20', vacated_profile_id: 'doc-x', vacated_reason: 'swap' }, {})).toBeNull()
  })

  it('a doctor still on a shift they hold approved leave over is on_leave', () => {
    expect(entryAbsence({ profile_id: 'doc-a', date: '2026-11-21' }, LEAVE)).toMatchObject({ kind: 'on_leave', profileId: 'doc-a' })
    expect(entryAbsence({ profile_id: 'doc-a', date: '2026-11-22' }, LEAVE)).toBeNull()
  })
})

describe('absenceSummary', () => {
  const vacated = { kind: 'vacated', profileId: 'doc-a', reason: 'leave', leaveRequestId: 'leave-1', note: null, open: false }

  it('names the leave type and dates when this viewer can see the leave', () => {
    const s = absenceSummary({ absence: vacated, leaveByProfile: LEAVE, doctorName: 'Sam Rivers', coverName: 'Dr Marsh', byName: 'Pat Admin' })
    expect(s).toEqual({ doctorName: 'Sam Rivers', headline: 'Sick leave', lines: ['20–21 Nov', 'Covered by Dr Marsh', 'Recorded by Pat Admin'] })
  })

  it('says only "On leave" when the leave row is hidden from this viewer', () => {
    const s = absenceSummary({ absence: vacated, leaveByProfile: {}, doctorName: 'Sam Rivers', coverName: 'Dr Marsh' })
    expect(s.headline).toBe('On leave')
    expect(s.lines).toEqual(['Covered by Dr Marsh'])
    // Known to be on leave (the RPC says so) but with no type to show.
    const onLeave = entryAbsence({ profile_id: 'doc-c', date: '2026-11-20' }, LEAVE)
    expect(absenceSummary({ absence: onLeave, leaveByProfile: LEAVE }).headline).toBe('On leave')
  })

  it('an open shift says so, and a note is for admins only', () => {
    const noShow = { kind: 'vacated', profileId: 'doc-a', reason: 'no_show', note: 'Did not answer', open: true }
    expect(absenceSummary({ absence: noShow, leaveByProfile: {} }).lines).toEqual(['Shift open — no cover yet'])
    expect(absenceSummary({ absence: noShow, leaveByProfile: {}, canSeeNote: true }).lines).toContain('Note: Did not answer')
    expect(absenceSummary({ absence: noShow, leaveByProfile: {} }).headline).toBe('No-show')
    const noCover = { ...noShow, open: false, noCover: true }
    expect(absenceSummary({ absence: noCover, leaveByProfile: {} }).lines).toEqual(['Shift not covered'])
  })
})

describe('isEntryOnLeave', () => {
  it('is true only for the doctor still holding a shift inside their approved leave', () => {
    expect(isEntryOnLeave({ profile_id: 'doc-a', date: '2026-11-20' }, LEAVE)).toBe(true)
    expect(isEntryOnLeave({ profile_id: 'doc-a', date: '2026-11-19' }, LEAVE)).toBe(false)
    expect(isEntryOnLeave({ profile_id: 'doc-b', date: '2026-11-20' }, LEAVE)).toBe(false)
  })
})

describe('mergeLeaveRanges', () => {
  const visible = [{ id: 'leave-1', profile_id: 'doc-a', date_from: '2026-11-20', date_to: '2026-11-21', leave_type: 'sick', submitted_by: 'admin-1' }]
  // The merge adds who recorded it (slot 4) where the row is visible.
  const MERGED = { 'doc-a': [['2026-11-20', '2026-11-21', 'sick', 'leave-1', 'admin-1']], 'doc-c': [['2026-11-20', '2026-11-20', null, null, null]] }

  it('takes who and when from the RPC, and the type only where a visible row matches', () => {
    const merged = mergeLeaveRanges([
      { profile_id: 'doc-a', date_from: '2026-11-20', date_to: '2026-11-21' },
      { profile_id: 'doc-c', date_from: '2026-11-20', date_to: '2026-11-20' },
    ], visible)
    expect(merged).toEqual(MERGED)
    expect(leaveRangeOn(merged, 'doc-c', '2026-11-20')).toEqual(['2026-11-20', '2026-11-20', null, null, null])
  })

  it('falls back to the visible rows alone when the RPC gave nothing', () => {
    expect(mergeLeaveRanges(null, visible)).toEqual({ 'doc-a': MERGED['doc-a'] })
  })
})

describe('rosterChangeDetail — reason', () => {
  const names = new Map([['doc-a', 'Sam Rivers'], ['doc-b', 'Bob Brown']])
  const base = { entry_date: '2026-11-20', shift_code: 'WD_08', profile_id_before: 'doc-a' }

  it('appends why a doctor came off a shift, and nothing for an ordinary edit', () => {
    expect(rosterChangeDetail({ ...base, action: 'assign', profile_id_after: 'doc-b', reason: 'leave', note: 'Sick leave' }, names))
      .toMatch(/Sam Rivers → Bob Brown — reason: Sick leave$/)
    expect(rosterChangeDetail({ ...base, action: 'unassign', reason: 'no_show', note: 'Did not answer' }, names))
      .toMatch(/— reason: no-show \(Did not answer\)$/)
    expect(rosterChangeDetail({ ...base, action: 'unassign', reason: 'swap' }, names)).toMatch(/— reason: swap$/)
    expect(rosterChangeDetail({ ...base, action: 'assign', profile_id_after: 'doc-b' }, names)).not.toMatch(/reason/)
  })
})

describe('VACANCY_LEAVE_TYPE_OPTIONS', () => {
  it('leaves out sick (its own reason) and a weekend off', () => {
    const values = VACANCY_LEAVE_TYPE_OPTIONS.map(o => o.value)
    expect(values).not.toContain('sick')
    expect(values).not.toContain('weekend_exception')
    expect(values).toContain('family_responsibility')
  })
})

describe('the no-cover row', () => {
  it('is the vacated doctor with nobody in their place: not a locum, not an open slot', () => {
    expect(isNoCoverRow({ vacated_profile_id: 'doc-a', profile_id: null, is_locum: false })).toBe(true)
    expect(isNoCoverRow({ vacated_profile_id: 'doc-a', profile_id: null, is_locum: true, locum_name: '[ ]' })).toBe(false)
    expect(isNoCoverRow({ vacated_profile_id: 'doc-a', profile_id: 'doc-b', is_locum: false })).toBe(false)
    expect(isNoCoverRow({ vacated_profile_id: null, profile_id: null, is_locum: false })).toBe(false)
  })

  it('NO_COVER_PATCH writes exactly that state and clears every flag', () => {
    expect(NO_COVER_PATCH).toMatchObject({ profile_id: null, is_locum: false, locum_name: null, locum_contact_id: null, is_flagged: false })
  })

  it('a snapshot drops updated_at so two reads of the same row compare equal', () => {
    expect(entrySnapshot({ id: 'e1', profile_id: 'a', updated_at: 'x' })).toEqual({ id: 'e1', profile_id: 'a' })
    expect(entrySnapshot(null)).toBeNull()
  })
})

describe('a doctor still on a shift over approved leave', () => {
  it('reads as an uncovered shift, naming who recorded the leave', () => {
    const leave = { 'doc-a': [['2026-11-20', '2026-11-21', 'sick', 'leave-1', 'admin-1']] }
    const absence = entryAbsence({ profile_id: 'doc-a', date: '2026-11-20' }, leave)
    expect(absence).toMatchObject({ kind: 'on_leave', byId: 'admin-1' })
    const s = absenceSummary({ absence, leaveByProfile: leave, doctorName: 'Sam Rivers', byName: 'Pat Admin' })
    expect(s.lines).toEqual(['20–21 Nov', 'Shift not covered', 'Recorded by Pat Admin'])
  })
})
