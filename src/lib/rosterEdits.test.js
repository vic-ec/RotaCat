import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mock } from '../test/mockSupabase'

vi.mock('./supabase', () => ({ supabase: mock.supabase }))
vi.mock('./leaveCancellation', () => ({ cancelLeaveRequest: vi.fn().mockResolvedValue({}) }))

import {
  assignCover, removeEntry, removeLocum, moveEntry, addCover, removeSlot, advertise, unadvertise,
  reinstate, reinstateBlocker, leaveQuestion, describeLinkedLeave, shiftMenuKind, emptySideEffects,
  swapEntries, swapProblem, afterLeaveCancelled, leaveShiftBlocker,
  removeCover, moveCover, changeAbsenceReason, coverOf,
} from './rosterEdits'
import { cancelLeaveRequest } from './leaveCancellation'

const nameOf = id => ({ 'doc-a': 'Alice Anderson', 'doc-b': 'Bob Brown', 'loc-1': 'Jo Marsh' })[id] || null
const base = { rosterMonthId: 'rm1', adminId: 'admin-1', nameOf }

const doctorRow = { id: 'e1', roster_month_id: 'rm1', date: '2026-08-10', shift_type_id: 'st1', profile_id: 'doc-a', is_locum: false, locum_name: null, locum_contact_id: null, counts_toward_contract_hours: true, is_flagged: false, updated_at: 'x' }
const noCoverRow = { ...doctorRow, profile_id: null, vacated_profile_id: 'doc-a', vacated_reason: 'leave', vacated_leave_request_id: 'leave-1', vacated_by: 'admin-1', vacated_at: '2026-08-09T10:00:00.000Z' }
const openSlotVacated = { ...noCoverRow, is_locum: true, locum_name: '[ ]' }
const openSlot = { ...doctorRow, profile_id: null, is_locum: true, locum_name: '[ ]' }
const namedLocum = { ...doctorRow, profile_id: 'loc-1', is_locum: true, locum_name: '[Marsh]', counts_toward_contract_hours: false }
const namedLocumVacated = { ...namedLocum, vacated_profile_id: 'doc-a', vacated_reason: 'no_show' }

const logRows = () => mock.find('roster_entry_changes', 'insert').map(c => c.payload)
const entryUpdates = () => mock.find('roster_entries', 'update')

beforeEach(() => { mock.reset(); cancelLeaveRequest.mockClear() })

describe('shiftMenuKind — which menu a tapped cell opens', () => {
  it('follows the spec table', () => {
    expect(shiftMenuKind(null, 'draft')).toBe('add')
    expect(shiftMenuKind(doctorRow, 'published')).toBe('vacancy')
    expect(shiftMenuKind(doctorRow, 'draft')).toBe('draft-doctor')
    expect(shiftMenuKind(openSlotVacated, 'published')).toBe('slot-vacated')
    expect(shiftMenuKind(openSlot, 'published')).toBe('slot')
    expect(shiftMenuKind({ ...openSlot, is_flagged: true }, 'published')).toBe('slot')
    expect(shiftMenuKind(namedLocum, 'published')).toBe('locum')
    expect(shiftMenuKind(namedLocumVacated, 'published')).toBe('locum')
    expect(shiftMenuKind(noCoverRow, 'published')).toBe('no-cover')
    // A doctor on approved leave still on the shift is just a doctor row.
    expect(shiftMenuKind(doctorRow, 'published')).toBe('vacancy')
  })
})

describe('removeEntry', () => {
  it('logs the removal BEFORE the delete, with no roster_entry_id, so the row lands', async () => {
    const result = await removeEntry({ ...base, entry: doctorRow, shiftCode: 'WD_08' })
    const order = mock.calls.filter(c => c.table === 'roster_entries' || c.table === 'roster_entry_changes').map(c => `${c.table}:${c.method}`)
    expect(order).toEqual(['roster_entry_changes:insert', 'roster_entries:delete'])
    const [log] = logRows()
    expect(log).toMatchObject({ action: 'remove', roster_entry_id: null, profile_id_before: 'doc-a', profile_id_after: null, batch_id: result.batchId })
    expect(log.entry_before).toMatchObject({ id: 'e1', profile_id: 'doc-a' })
    expect(log.entry_before.updated_at).toBeUndefined()
    expect(log.entry_after).toBeNull()
    expect(result.description).toBe('Alice Anderson removed from Mon 10 Aug · WD 08h-18h')
  })

  it('never deletes a row with a vacated doctor on it', async () => {
    await expect(removeEntry({ ...base, entry: openSlotVacated, shiftCode: 'WD_08' })).rejects.toThrow(/Put back/)
    await expect(removeEntry({ ...base, entry: noCoverRow, shiftCode: 'WD_08' })).rejects.toThrow(/Put back/)
    expect(mock.find('roster_entries', 'delete')).toHaveLength(0)
  })

  it('cancels an open advert before the delete (the FK would cascade-delete it) and records it', async () => {
    mock.respond('shift_advertisements', call => (call.method === 'select' ? [{ id: 'ad-1' }] : null))
    const result = await removeEntry({ ...base, entry: openSlot, shiftCode: 'WD_08' })
    expect(mock.find('shift_advertisements', 'update')[0].payload).toEqual({ status: 'cancelled' })
    expect(logRows()[0].side_effects).toMatchObject({ adverts_cancelled: ['ad-1'] })
    expect(result.description).toMatch(/open locum slot removed/)
  })
})

describe('removeLocum', () => {
  it('reopens the slot as [ ] when a doctor was vacated — the row and its name stay', async () => {
    await removeLocum({ ...base, entry: namedLocumVacated, shiftCode: 'WD_08' })
    expect(mock.find('roster_entries', 'delete')).toHaveLength(0)
    expect(entryUpdates()[0].payload).toMatchObject({ profile_id: null, is_locum: true, locum_name: '[ ]' })
    expect(entryUpdates()[0].payload.vacated_profile_id).toBeUndefined()
    expect(logRows()[0]).toMatchObject({ action: 'remove', profile_id_before: 'loc-1' })
    expect(logRows()[0].entry_after).toMatchObject({ vacated_profile_id: 'doc-a', locum_name: '[ ]' })
  })

  it('deletes the row when nobody was vacated', async () => {
    await removeLocum({ ...base, entry: namedLocum, shiftCode: 'WD_08' })
    expect(mock.find('roster_entries', 'delete')).toHaveLength(1)
  })
})

describe('removeSlot — the locum slot beside a vacated doctor', () => {
  it('turns the row into the no-cover state, keeps the vacated doctor, cancels any advert', async () => {
    mock.respond('shift_advertisements', call => (call.method === 'select' ? [{ id: 'ad-2' }] : null))
    const result = await removeSlot({ ...base, entry: openSlotVacated, shiftCode: 'WD_08' })
    expect(mock.find('roster_entries', 'delete')).toHaveLength(0)
    const patch = entryUpdates()[0].payload
    expect(patch).toMatchObject({ profile_id: null, is_locum: false, locum_name: null })
    expect(patch.vacated_profile_id).toBeUndefined()
    const [log] = logRows()
    expect(log).toMatchObject({ action: 'slot_remove', profile_id_before: 'doc-a', roster_entry_id: 'e1' })
    expect(log.entry_after).toMatchObject({ vacated_profile_id: 'doc-a', is_locum: false, profile_id: null })
    expect(log.side_effects.adverts_cancelled).toEqual(['ad-2'])
    expect(result.description).toBe('Locum slot removed from Mon 10 Aug · WD 08h-18h; Alice Anderson stays struck through')
  })

  it('refuses a filled slot and a slot with nobody vacated', async () => {
    await expect(removeSlot({ ...base, entry: namedLocumVacated, shiftCode: 'WD_08' })).rejects.toThrow(/filled/)
    await expect(removeSlot({ ...base, entry: openSlot, shiftCode: 'WD_08' })).rejects.toThrow(/Nobody was taken off/)
  })
})

describe('addCover — cover added to a no-cover row', () => {
  it('"open" makes a [ ] slot beside the struck name; "advertise" also inserts an advert', async () => {
    mock.respond('shift_advertisements', call => (call.method === 'insert' ? { data: { id: 'ad-9' }, error: null } : []))
    await addCover({ ...base, entry: noCoverRow, shiftCode: 'WD_08', mode: 'open' })
    expect(entryUpdates()[0].payload).toMatchObject({ is_locum: true, locum_name: '[ ]', profile_id: null })
    expect(logRows()[0]).toMatchObject({ action: 'slot_add', profile_id_before: 'doc-a', advertised: false })
    mock.reset()
    mock.respond('shift_advertisements', call => (call.method === 'insert' ? { data: { id: 'ad-9' }, error: null } : []))
    const result = await addCover({ ...base, entry: noCoverRow, shiftCode: 'WD_08', mode: 'advertise' })
    expect(mock.find('shift_advertisements', 'insert')[0].payload).toMatchObject({ roster_entry_id: 'e1', status: 'open' })
    expect(logRows()[0].side_effects.advert_created).toBe('ad-9')
    expect(result.description).toMatch(/advertised/)
  })

  it('"replace" puts the cover on the same row (the struck name stays) and logs slot_add', async () => {
    await addCover({ ...base, entry: noCoverRow, shiftCode: 'WD_08', mode: 'replace', cover: { kind: 'doctor', id: 'doc-b' } })
    expect(mock.find('roster_entries', 'insert')).toHaveLength(0)
    expect(entryUpdates()[0].payload).toMatchObject({ profile_id: 'doc-b', is_locum: false })
    expect(logRows()[0]).toMatchObject({ action: 'slot_add', profile_id_before: 'doc-a', profile_id_after: 'doc-b' })
  })

  it('refuses on anything that is not a no-cover row', async () => {
    await expect(addCover({ ...base, entry: openSlotVacated, shiftCode: 'WD_08', mode: 'open' })).rejects.toThrow()
  })
})

describe('assignCover', () => {
  it('inserts into an empty cell and logs assign with the new row as entry_after', async () => {
    mock.respond('roster_entries', call => (call.method === 'insert' ? { data: { id: 'new-1', ...call.payload }, error: null } : null))
    const result = await assignCover({ ...base, cover: { kind: 'doctor', id: 'doc-b' }, date: '2026-08-10', shiftCode: 'WD_08', shiftTypeId: 'st1' })
    const [log] = logRows()
    expect(log).toMatchObject({ action: 'assign', roster_entry_id: 'new-1', profile_id_after: 'doc-b' })
    expect(log.entry_before).toBeNull()
    expect(log.entry_after).toMatchObject({ id: 'new-1', profile_id: 'doc-b' })
    expect(result.description).toBe('Bob Brown put on Mon 10 Aug · WD 08h-18h')
  })

  it('replacing a doctor on the same row says so', async () => {
    const result = await assignCover({ ...base, cover: { kind: 'locum', id: 'loc-1', name: 'Jo Marsh', surname: 'Marsh' }, date: '2026-08-10', shiftCode: 'WD_08', shiftTypeId: 'st1', entryBefore: doctorRow })
    expect(result.description).toBe('Alice Anderson replaced with Jo Marsh (locum) on Mon 10 Aug · WD 08h-18h')
    expect(logRows()[0]).toMatchObject({ profile_id_before: 'doc-a', profile_id_after: 'loc-1' })
  })
})

describe('moveEntry', () => {
  it('refuses a same-day double booking, otherwise updates and logs move with both snapshots', async () => {
    await expect(moveEntry({ ...base, entry: doctorRow, shiftCodeBefore: 'WD_08', targetDate: '2026-08-11', targetShiftCode: 'WD_12', targetShiftTypeId: 'st2', entries: [doctorRow, { id: 'e9', date: '2026-08-11', profile_id: 'doc-a' }] })).rejects.toThrow(/already has a shift/)
    await moveEntry({ ...base, entry: doctorRow, shiftCodeBefore: 'WD_08', targetDate: '2026-08-11', targetShiftCode: 'WD_12', targetShiftTypeId: 'st2', entries: [doctorRow] })
    expect(logRows()[0]).toMatchObject({ action: 'move', date_before: '2026-08-10', shift_code_before: 'WD_08', entry_date: '2026-08-11' })
    expect(logRows()[0].entry_after).toMatchObject({ date: '2026-08-11', shift_type_id: 'st2' })
  })
})

describe('advertise / unadvertise', () => {
  it('advertise inserts an open advert and refuses a second one', async () => {
    mock.respond('shift_advertisements', call => (call.method === 'insert' ? { data: { id: 'ad-3' }, error: null } : []))
    await advertise({ ...base, entry: openSlotVacated, shiftCode: 'WD_08' })
    expect(logRows()[0]).toMatchObject({ action: 'advertise', profile_id_before: 'doc-a' })
    expect(logRows()[0].side_effects.advert_created).toBe('ad-3')
    mock.reset()
    mock.respond('shift_advertisements', () => [{ id: 'ad-3' }])
    await expect(advertise({ ...base, entry: openSlotVacated, shiftCode: 'WD_08' })).rejects.toThrow(/already advertised/)
  })

  it('unadvertise sets the advert to cancelled, never deletes it', async () => {
    mock.respond('shift_advertisements', call => (call.method === 'select' ? [{ id: 'ad-3' }] : null))
    await unadvertise({ ...base, entry: openSlotVacated, shiftCode: 'WD_08' })
    expect(mock.find('shift_advertisements', 'delete')).toHaveLength(0)
    expect(mock.find('shift_advertisements', 'update')[0].payload).toEqual({ status: 'cancelled' })
    expect(logRows()[0]).toMatchObject({ action: 'unadvertise' })
    expect(logRows()[0].side_effects.adverts_cancelled).toEqual(['ad-3'])
  })
})

describe('Put back', () => {
  it('names the two refusals: another shift that day, or the slot filled since', () => {
    expect(reinstateBlocker({ entry: openSlotVacated, entries: [openSlotVacated, { id: 'e5', date: '2026-08-10', profile_id: 'doc-a' }], nameOf })).toMatch(/another shift on Mon 10 Aug/)
    expect(reinstateBlocker({ entry: namedLocumVacated, entries: [namedLocumVacated], nameOf })).toMatch(/filled by Marsh \(locum\)/)
    expect(reinstateBlocker({ entry: { ...noCoverRow, profile_id: 'doc-b' }, entries: [], nameOf })).toMatch(/filled by Bob Brown/)
    expect(reinstateBlocker({ entry: openSlotVacated, entries: [openSlotVacated], nameOf })).toBeNull()
    expect(reinstateBlocker({ entry: noCoverRow, entries: [noCoverRow], nameOf })).toBeNull()
  })

  it('asks about the linked leave, naming type and dates when visible', () => {
    const leaveByProfile = { 'doc-a': [['2026-08-10', '2026-08-12', 'sick', 'leave-1']] }
    // A leave over several days asks about the other days; a one-day leave
    // is cancelled with the put-back, so its question is the simple one.
    expect(leaveQuestion({ entry: noCoverRow, leaveByProfile, nameOf })).toBe("Alice Anderson's sick leave runs Mon 10 Aug – Wed 12 Aug. Cancel all of it, or keep the other days?")
    expect(leaveQuestion({ entry: noCoverRow, leaveByProfile: {}, nameOf })).toBe("Also cancel Alice Anderson's leave for Mon 10 Aug?")
    expect(describeLinkedLeave({ entry: noCoverRow, leaveByProfile })).toMatchObject({ type: 'sick leave', multiDay: true })
    expect(describeLinkedLeave({ entry: noCoverRow, leaveByProfile: { 'doc-a': [['2026-08-10', '2026-08-10', 'sick', 'leave-1']] } })).toMatchObject({ multiDay: false, dates: 'Mon 10 Aug' })
    expect(leaveQuestion({ entry: { ...noCoverRow, vacated_leave_request_id: null }, leaveByProfile, nameOf })).toBeNull()
  })

  it('restores the doctor, clears every vacated_* and locum field, cancels adverts, keeps the leave by default', async () => {
    mock.respond('roster_entries', call => (call.method === 'select' ? [openSlotVacated] : null))
    mock.respond('shift_advertisements', call => (call.method === 'select' ? [{ id: 'ad-1' }] : null))
    const result = await reinstate({ ...base, entry: openSlotVacated, shiftCode: 'WD_08', entries: [openSlotVacated] })
    const patch = entryUpdates()[0].payload
    expect(patch).toMatchObject({ profile_id: 'doc-a', is_locum: false, locum_name: null, vacated_profile_id: null, vacated_reason: null, vacated_leave_request_id: null, vacated_by: null, vacated_at: null })
    expect(cancelLeaveRequest).not.toHaveBeenCalled()
    const [log] = logRows()
    expect(log).toMatchObject({ action: 'reinstate', profile_id_after: 'doc-a', note: 'Leave kept' })
    expect(log.side_effects).toMatchObject({ adverts_cancelled: ['ad-1'], leave_request_cancelled: null })
    expect(result.description).toBe('Alice Anderson put back on Mon 10 Aug · WD 08h-18h')
  })

  it('cancels the linked leave when asked, and records it for undo', async () => {
    mock.respond('roster_entries', call => (call.method === 'select' ? [noCoverRow] : null))
    const result = await reinstate({ ...base, entry: noCoverRow, shiftCode: 'WD_08', entries: [noCoverRow], cancelLeave: true })
    expect(cancelLeaveRequest).toHaveBeenCalledWith('leave-1', expect.any(String))
    expect(logRows()[0].side_effects.leave_request_cancelled).toBe('leave-1')
    expect(result.description).toMatch(/their leave was cancelled/)
  })

  it('re-reads the row and refuses if the slot was filled since the menu opened', async () => {
    mock.respond('roster_entries', call => (call.method === 'select' ? [{ ...openSlotVacated, profile_id: 'doc-b', is_locum: false }] : null))
    await expect(reinstate({ ...base, entry: openSlotVacated, shiftCode: 'WD_08', entries: [openSlotVacated] })).rejects.toThrow(/filled by Bob Brown/)
    expect(entryUpdates()).toHaveLength(0)
  })
})

describe('emptySideEffects', () => {
  it('carries every key, so each row compares alike', () => {
    expect(Object.keys(emptySideEffects()).sort()).toEqual(['advert_created', 'adverts_cancelled', 'adverts_reopened', 'leave_request_cancelled', 'leave_request_captured', 'leave_request_reapproved', 'reverses_batch_id'])
  })
})

describe('swapEntries — two doctors exchange shifts', () => {
  const aRow = { ...doctorRow, id: 'a', date: '2026-08-10', profile_id: 'doc-a' }
  const bSameDay = { ...doctorRow, id: 'b', date: '2026-08-10', shift_type_id: 'st4', profile_id: 'doc-b' }
  const bOtherDay = { ...bSameDay, date: '2026-08-13' }

  it('swaps two doctors on the same day, logged as one undoable batch', async () => {
    const entries = [aRow, bSameDay]
    const result = await swapEntries({ ...base, a: aRow, b: bSameDay, shiftCodeA: 'WD_12', shiftCodeB: 'WD_22', entries })
    const updates = entryUpdates()
    expect(updates.map(u => [u.filters.find(f => f[1] === 'id')[2], u.payload.profile_id])).toEqual([['a', 'doc-b'], ['b', 'doc-a']])
    const logs = logRows()
    expect(logs).toHaveLength(2)
    expect(logs.every(l => l.batch_id === result.batchId && l.reason === 'swap' && l.action === 'assign')).toBe(true)
    expect(logs[0]).toMatchObject({ profile_id_before: 'doc-a', profile_id_after: 'doc-b' })
    expect(logs[0].entry_after).toMatchObject({ id: 'a', profile_id: 'doc-b' })
    expect(result.description).toMatch(/^Alice Anderson and Bob Brown swapped: Bob Brown on Mon 10 Aug · WD 12h-22h, Alice Anderson on Mon 10 Aug · WD 22h-10h/)
  })

  it('swaps across two days', async () => {
    await swapEntries({ ...base, a: aRow, b: bOtherDay, shiftCodeA: 'WD_22', shiftCodeB: 'WD_22', entries: [aRow, bOtherDay] })
    expect(entryUpdates()).toHaveLength(2)
  })

  it('refuses when a doctor would have two shifts on one day, or would work while on leave', async () => {
    const aOtherShiftThatDay = { ...doctorRow, id: 'a2', date: '2026-08-13', profile_id: 'doc-a' }
    await expect(swapEntries({ ...base, a: aRow, b: bOtherDay, shiftCodeA: 'WD_22', shiftCodeB: 'WD_22', entries: [aRow, bOtherDay, aOtherShiftThatDay] }))
      .rejects.toThrow('Alice Anderson already has another shift on Thu 13 Aug.')
    expect(swapProblem({ a: aRow, b: bOtherDay, entries: [aRow, bOtherDay], nameOf, isOnLeave: (p, d) => p === 'doc-b' && d === '2026-08-10' }))
      .toBe('Bob Brown is on approved leave on Mon 10 Aug.')
    expect(swapProblem({ a: aRow, b: namedLocum, entries: [], nameOf })).toMatch(/Only two doctors/)
    expect(entryUpdates()).toHaveLength(0)
  })
})

describe('afterLeaveCancelled — the shifts a cancelled leave opened', () => {
  // Landes taken off for sick leave; Alli the locum covers it.
  const covered = { ...namedLocum, id: 'c1', vacated_profile_id: 'doc-a', vacated_reason: 'leave', vacated_leave_request_id: 'leave-1' }
  beforeEach(() => { mock.respond('roster_entries', call => (call.method === 'select' ? [covered] : undefined)) })

  it('keeps the cover and stops calling it leave', async () => {
    const r = await afterLeaveCancelled({ ...base, entry: covered, shiftCode: 'WD_12', entries: [covered], undoShift: false })
    expect(entryUpdates()[0].payload).toEqual({ vacated_reason: 'other', vacated_note: 'Leave cancelled; cover kept', vacated_leave_request_id: null })
    expect(logRows()[0]).toMatchObject({ action: 'assign', note: 'Leave cancelled; cover kept', batch_id: r.batchId })
  })

  it('puts the doctor back and removes the cover', async () => {
    await afterLeaveCancelled({ ...base, entry: covered, shiftCode: 'WD_12', entries: [covered], undoShift: true })
    expect(entryUpdates()[0].payload).toMatchObject({ profile_id: 'doc-a', is_locum: false, locum_name: null, vacated_profile_id: null, vacated_leave_request_id: null })
    expect(logRows()[0]).toMatchObject({ action: 'reinstate', note: 'Leave cancelled; cover removed' })
  })

  it('will not put the doctor back over another shift that day', async () => {
    const night = { ...doctorRow, id: 'n1', shift_type_id: 'st4', profile_id: 'doc-a' }
    expect(leaveShiftBlocker({ entry: covered, entries: [covered, night], nameOf })).toBe('Alice Anderson has another shift on Mon 10 Aug')
    await expect(afterLeaveCancelled({ ...base, entry: covered, shiftCode: 'WD_12', entries: [covered, night], undoShift: true })).rejects.toThrow(/cannot go back/)
    expect(entryUpdates()).toHaveLength(0)
  })
})

describe('the cover on a shift a doctor came off', () => {
  const covered = { ...namedLocumVacated, id: 'c1', vacated_reason: 'leave', vacated_leave_request_id: 'leave-1' }
  beforeEach(() => { mock.respond('roster_entries', call => (call.method === 'select' ? [covered] : undefined)) })

  it('Remove → close leaves no slot, the absent doctor kept', async () => {
    await removeCover({ ...base, entry: covered, shiftCode: 'WD_12', mode: 'close' })
    const patch = entryUpdates()[0].payload
    expect(patch).toMatchObject({ profile_id: null })
    expect(patch).not.toHaveProperty('vacated_profile_id')
    expect(logRows()[0]).toMatchObject({ action: 'remove', note: 'Cover removed; shift runs short' })
  })

  it('Remove → advertise reopens the slot and offers it to locums', async () => {
    await removeCover({ ...base, entry: covered, shiftCode: 'WD_12', mode: 'advertise' })
    expect(entryUpdates()[0].payload).toMatchObject({ locum_name: '[ ]', is_locum: true })
    expect(mock.find('shift_advertisements', 'insert')).toHaveLength(1)
  })

  it('Move puts the locum on another shift and reopens this one', async () => {
    const r = await moveCover({ ...base, entry: covered, shiftCode: 'WD_12', targetDate: '2026-08-12', targetShiftCode: 'WD_22', targetShiftTypeId: 'st4', entries: [covered] })
    expect(coverOf(covered, nameOf)).toMatchObject({ kind: 'locum', id: 'loc-1' })
    expect(logRows().map(l => l.batch_id).every(b => b === r.batchId)).toBe(true)
    expect(r.description).toMatch(/moved to Wed 12 Aug · WD 22h-10h; Mon 10 Aug · WD 12h-22h is open again/)
  })

  it('Change why … is off: leave → swap, cancelling the leave when asked', async () => {
    const r = await changeAbsenceReason({ ...base, entry: covered, shiftCode: 'WD_12', reason: 'swap', note: 'Moved to the night', cancelLeave: true })
    expect(entryUpdates()[0].payload).toEqual({ vacated_reason: 'swap', vacated_note: 'Moved to the night', vacated_leave_request_id: null })
    expect(cancelLeaveRequest).toHaveBeenCalledWith('leave-1', 'Reason changed on the roster')
    expect(r.description).toMatch(/reason on .* is now swap; their leave was cancelled/)
  })

  it('Change why … is off: "other" needs a note', async () => {
    await expect(changeAbsenceReason({ ...base, entry: covered, shiftCode: 'WD_12', reason: 'other' })).rejects.toThrow(/note/)
  })
})
