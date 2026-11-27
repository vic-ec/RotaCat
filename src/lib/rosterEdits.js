// Every edit the roster grid makes, as one function each. Each one:
//
//   1. writes the roster_entries change (and anything it touches elsewhere:
//      an advert started or stopped, leave captured);
//   2. logs it under ONE batch_id with the full row before and after and
//      the ids of those side effects (see lib/changeLog.js), which is what
//      lets lib/rosterUndo.js reverse it exactly and refuse when the shift
//      has changed since;
//   3. resolves to { batchId, description, logError } — the description is
//      what the "Saved — …" toast says.
//
// Throws with a message written for the admin when the edit itself is
// refused. A failed log insert never fails the edit: it is reported (see
// setLogErrorListener) and returned as logError.
//
// Two rules every function here keeps:
//   - no edit deletes a row that has vacated_profile_id set, except Put
//     back (which restores it) and Undo;
//   - a row's adverts are cancelled, never deleted — and always before the
//     row itself is deleted, since shift_advertisements cascades on delete
//     and a cascaded advert is gone for good.
import { supabase } from './supabase'
import { logRosterEntryChange } from './changeLog'
import { coverPatch, coverProfileId, isOpenLocumSlot, locumDisplayName, OPEN_SLOT_PATCH } from './locumCover'
import { entrySnapshot, findSameDayConflict, isNoCoverRow, NO_COVER_PATCH } from './rosterVacancy'
import { labelForShiftCode } from './shiftLabels'
import { shortDate } from './reviewLog'
import { cancelLeaveRequest } from './leaveCancellation'
import { LEAVE_TYPE_LABELS, submitLeaveRequest } from './leaveRequests'
import { adjustedTimesLabel, validateTimes } from './shiftTimes'

// What a tapped roster cell is, and so which shift menu it gets (see
// components/ShiftMenu.jsx).
//   'add'           an empty cell's "+" (no entry)
//   'vacancy'       a doctor on a published roster (the vacancy form)
//   'draft-doctor'  a doctor on a draft roster
//   'slot-vacated'  an open "[ ]" slot with a vacated doctor
//   'slot'          an open or unfilled slot with nobody vacated
//   'locum'         a named locum
//   'no-cover'      a struck-through name with no cover
export function shiftMenuKind(entry, rosterStatus) {
  if (!entry) return 'add'
  if (isNoCoverRow(entry)) return 'no-cover'
  if (entry.is_locum) {
    if (isOpenLocumSlot(entry)) return entry.vacated_profile_id ? 'slot-vacated' : 'slot'
    return 'locum'
  }
  if (entry.profile_id) return rosterStatus === 'published' ? 'vacancy' : 'draft-doctor'
  return 'slot'
}

export const CHANGED_SINCE_MESSAGE = 'This shift has changed since. Open History to review.'

export function newBatchId() {
  return crypto.randomUUID()
}

// Empty side_effects, so every row carries the same keys. Each pair is
// reversed by lib/rosterUndo.js into its opposite.
export function emptySideEffects() {
  return {
    leave_request_captured: null,
    leave_request_cancelled: null,
    leave_request_reapproved: null,
    advert_created: null,
    adverts_cancelled: [],
    adverts_reopened: [],
    reverses_batch_id: null,
  }
}

// "Mon 10 Aug · WD 08h-18h" for the toast and History.
export function shiftLabel(date, shiftCode) {
  return `${shortDate(date, new Date().getFullYear())} · ${labelForShiftCode(shiftCode)}`
}

// "Sam Rivers'" rather than "Sam Rivers's".
export function possessive(name) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`
}

export function coverName(cover, nameOf) {
  if (!cover) return 'nobody'
  if (cover.kind === 'doctor') return nameOf(cover.id) || 'a doctor'
  return `${cover.name} (locum)`
}

// Who the row holds, for a description: the doctor, the locum, "[ ]" or
// nobody.
export function holderName(entry, nameOf) {
  if (!entry) return null
  if (entry.is_locum) {
    const name = locumDisplayName(entry.locum_name)
    return name ? `${name} (locum)` : 'an open locum slot'
  }
  return entry.profile_id ? (nameOf(entry.profile_id) || 'a doctor') : null
}

async function fetchEntry(entryId) {
  const { data, error } = await supabase.from('roster_entries').select('*').eq('id', entryId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { ...data, date: data.date?.slice(0, 10) } : null
}

export async function fetchOpenAdvertIds(entryId) {
  const { data, error } = await supabase.from('shift_advertisements').select('id').eq('roster_entry_id', entryId).eq('status', 'open')
  if (error) throw new Error(error.message)
  return (data || []).map(a => a.id)
}

// Set every open advert on the row to cancelled (never deleted). Returns
// the ids it cancelled, for side_effects.
export async function cancelOpenAdverts(entryId) {
  const ids = await fetchOpenAdvertIds(entryId)
  if (ids.length === 0) return []
  const { error } = await supabase.from('shift_advertisements').update({ status: 'cancelled' }).in('id', ids)
  if (error) throw new Error(error.message)
  return ids
}

async function insertAdvert(entryId, adminId) {
  const { data, error } = await supabase.from('shift_advertisements')
    .insert({ roster_entry_id: entryId, advertised_by: adminId, status: 'open' })
    .select('id').maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

async function updateEntry(entryId, patch) {
  const { error } = await supabase.from('roster_entries').update(patch).eq('id', entryId)
  if (error) throw new Error(error.message)
}

// ── Assign / fill ────────────────────────────────────────────────────────
// Puts a cover on a slot: a doctor, a locum with an account, or a locum
// with none yet. Updates the row already in the slot when there is one —
// so a shift a doctor was taken off keeps its struck-through name beside
// whoever fills it — and inserts otherwise.
// `replacedProfileId`: a new row taking the place of a doctor who moved
// off this slot (Move → fill), so its hint reads "… replaced <them>".
export async function assignCover({ rosterMonthId, cover, date, shiftCode, shiftTypeId, entryBefore = null, replacedProfileId = null, adminId, nameOf, batchId = newBatchId() }) {
  const patch = {
    ...coverPatch(cover),
    // A doctor taking over what was a locum's slot works it on contract
    // hours again; a locum's slot never counted.
    ...(cover.kind === 'doctor' && entryBefore?.is_locum ? { counts_toward_contract_hours: true } : {}),
  }
  let entryAfter
  if (entryBefore) {
    await updateEntry(entryBefore.id, patch)
    entryAfter = { ...entryBefore, ...patch }
  } else {
    const { data, error } = await supabase.from('roster_entries')
      .insert({ roster_month_id: rosterMonthId, date, shift_type_id: shiftTypeId, ...patch, position: 99 })
      .select('*').maybeSingle()
    if (error) throw new Error(error.message)
    entryAfter = data ? { ...data, date: data.date?.slice(0, 10) } : null
  }
  const wasNoCover = isNoCoverRow(entryBefore)
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: entryAfter?.id ?? entryBefore?.id ?? null,
    entryDate: date,
    shiftCode,
    action: wasNoCover ? 'slot_add' : 'assign',
    // For a row with a vacated doctor the "before" names them, so History
    // shows who the change affected.
    profileIdBefore: entryBefore?.profile_id ?? entryBefore?.vacated_profile_id ?? replacedProfileId ?? null,
    profileIdAfter: coverProfileId(cover),
    changedBy: adminId,
    locumName: cover.kind === 'contact' ? cover.name : null,
    batchId,
    entryBefore: entrySnapshot(entryBefore),
    entryAfter: entrySnapshot(entryAfter),
    sideEffects: emptySideEffects(),
  })
  const who = coverName(cover, nameOf)
  const prior = holderName(entryBefore, nameOf)
  const description = prior && !entryBefore.is_locum && entryBefore.profile_id
    ? `${prior} replaced with ${who} on ${shiftLabel(date, shiftCode)}`
    : `${who} put on ${shiftLabel(date, shiftCode)}`
  return { batchId, description, logError }
}

// ── Remove ───────────────────────────────────────────────────────────────
// Deletes a row nobody was vacated from: a doctor on a draft roster, a
// named locum covering nobody, an open or unfilled slot. The log is written
// BEFORE the delete with roster_entry_id null, so it lands (an insert that
// referenced the just-deleted row was being rejected, and no removal ever
// reached History).
export async function removeEntry({ rosterMonthId, entry, shiftCode, adminId, nameOf, batchId = newBatchId() }) {
  if (entry.vacated_profile_id) throw new Error(`${nameOf(entry.vacated_profile_id) || 'This doctor'} was taken off this shift; use "Put back" to restore them instead of removing the row.`)
  const sideEffects = emptySideEffects()
  sideEffects.adverts_cancelled = await cancelOpenAdverts(entry.id)
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: null,
    entryDate: entry.date,
    shiftCode,
    action: 'remove',
    profileIdBefore: entry.profile_id,
    profileIdAfter: null,
    changedBy: adminId,
    locumName: entry.is_locum && !entry.profile_id ? locumDisplayName(entry.locum_name) || null : null,
    batchId,
    entryBefore: entrySnapshot(entry),
    entryAfter: null,
    sideEffects,
  })
  const { error } = await supabase.from('roster_entries').delete().eq('id', entry.id)
  if (error) throw new Error(error.message)
  const who = holderName(entry, nameOf) || 'the slot'
  return { batchId, description: `${who} removed from ${shiftLabel(entry.date, shiftCode)}`, logError }
}

// A named locum taken off a shift. The slot reopens as "[ ]" when a doctor
// was vacated from it (their name must stay), and the row is deleted
// otherwise.
export async function removeLocum({ rosterMonthId, entry, shiftCode, adminId, nameOf, batchId = newBatchId() }) {
  if (!entry.vacated_profile_id) return removeEntry({ rosterMonthId, entry, shiftCode, adminId, nameOf, batchId })
  const patch = { ...OPEN_SLOT_PATCH, counts_toward_contract_hours: entry.counts_toward_contract_hours }
  await updateEntry(entry.id, patch)
  const entryAfter = { ...entry, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: entry.id,
    entryDate: entry.date,
    shiftCode,
    action: 'remove',
    profileIdBefore: entry.profile_id,
    profileIdAfter: null,
    changedBy: adminId,
    locumName: !entry.profile_id ? locumDisplayName(entry.locum_name) || null : null,
    batchId,
    entryBefore: entrySnapshot(entry),
    entryAfter: entrySnapshot(entryAfter),
    sideEffects: emptySideEffects(),
  })
  return { batchId, description: `${holderName(entry, nameOf)} removed from ${shiftLabel(entry.date, shiftCode)}; the slot is open again`, logError }
}

// ── The cover on a shift a doctor came off ──────────────────────────────
// Who covers a row, as a cover object assignCover takes (lib/locumCover).
export function coverOf(entry, nameOf) {
  if (!entry) return null
  if (entry.locum_contact_id) return { kind: 'contact', id: entry.locum_contact_id, name: locumDisplayName(entry.locum_name) }
  if (entry.is_locum && entry.profile_id) {
    const full = nameOf(entry.profile_id) || ''
    return { kind: 'locum', id: entry.profile_id, name: full.split(' ')[0], surname: locumDisplayName(entry.locum_name) || full.split(' ').slice(1).join(' ') }
  }
  if (entry.profile_id) return { kind: 'doctor', id: entry.profile_id }
  return null
}

// Remove → the cover comes off and the absent doctor stays struck through:
//   'open'       the slot reopens as [ ]
//   'advertise'  the same, and it is offered to locums
//   'close'      no slot; the shift runs short
export async function removeCover({ rosterMonthId, entry, shiftCode, mode, adminId, nameOf, batchId = newBatchId() }) {
  if (!['open', 'advertise', 'close'].includes(mode)) throw new Error('Choose what happens to the shift.')
  if (!entry.vacated_profile_id) throw new Error('Nobody was taken off this shift.')
  const sideEffects = emptySideEffects()
  sideEffects.adverts_cancelled = await cancelOpenAdverts(entry.id)
  const patch = mode === 'close'
    ? { ...NO_COVER_PATCH }
    : { ...OPEN_SLOT_PATCH, counts_toward_contract_hours: entry.counts_toward_contract_hours }
  await updateEntry(entry.id, patch)
  if (mode === 'advertise') {
    const { data: ad } = await supabase.from('shift_advertisements')
      .insert({ roster_entry_id: entry.id, advertised_by: adminId, status: 'open' }).select('id').maybeSingle()
    sideEffects.advert_created = ad?.id ?? null
  }
  const entryAfter = { ...entry, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: entry.id, entryDate: entry.date, shiftCode, action: 'remove',
    profileIdBefore: entry.profile_id, profileIdAfter: null, advertised: mode === 'advertise', changedBy: adminId,
    locumName: !entry.profile_id ? locumDisplayName(entry.locum_name) || null : null,
    note: mode === 'close' ? 'Cover removed; shift runs short' : 'Cover removed; slot reopened',
    batchId, entryBefore: entrySnapshot(entry), entryAfter: entrySnapshot(entryAfter), sideEffects,
  })
  const who = holderName(entry, nameOf)
  const what = mode === 'close' ? 'the shift runs short' : mode === 'advertise' ? 'the slot is open and advertised' : 'the slot is open again'
  return { batchId, description: `${who} removed from ${shiftLabel(entry.date, shiftCode)}; ${what}`, logError }
}

// Move → the cover goes to another shift (any day of the month) and this
// slot reopens as [ ], the absent doctor still struck through above it.
export async function moveCover({ rosterMonthId, entry, shiftCode, targetDate, targetShiftCode, targetShiftTypeId, entries, adminId, nameOf, batchId = newBatchId() }) {
  const cover = coverOf(entry, nameOf)
  if (!cover) throw new Error('Nobody covers this shift.')
  if (cover.kind !== 'contact' && findSameDayConflict({ entries, date: targetDate, profileId: cover.id, excludeEntryId: entry.id })) {
    throw new Error(`${holderName(entry, nameOf)} already has a shift on ${shortDate(targetDate)}.`)
  }
  if (targetDate === entry.date && targetShiftCode === shiftCode) throw new Error('Pick a different shift.')
  await assignCover({ rosterMonthId, cover, date: targetDate, shiftCode: targetShiftCode, shiftTypeId: targetShiftTypeId, adminId, nameOf, batchId })
  await removeCover({ rosterMonthId, entry, shiftCode, mode: 'open', adminId, nameOf, batchId })
  return {
    batchId,
    description: `${holderName(entry, nameOf)} moved to ${shiftLabel(targetDate, targetShiftCode)}; ${shiftLabel(entry.date, shiftCode)} is open again`,
    logError: null,
  }
}

// ── Why the absent doctor is off ─────────────────────────────────────────
// Change the reason recorded for a doctor taken off this shift — "sick
// leave" recorded in error that was really a swap, say. reason: 'sick' |
// 'leave' (with leaveType) | 'swap' | 'no_show' | 'other' (note needed).
// A leave reason links the leave already covering the date or captures a
// one-day one; moving off leave can cancel the leave it was linked to
// (cancelLeave). The shift and its cover are untouched.
const REASON_STORED = { sick: 'leave', leave: 'leave', swap: 'swap', no_show: 'no_show', other: 'other' }
export async function changeAbsenceReason({
  rosterMonthId, entry, shiftCode, reason, leaveType = 'sick', note = '', existingLeaveId = null, cancelLeave = false,
  adminId, nameOf, batchId = newBatchId(),
}) {
  const stored = REASON_STORED[reason]
  if (!stored) throw new Error('Choose a reason.')
  if (!entry.vacated_profile_id) throw new Error('Nobody was taken off this shift.')
  const trimmed = (note || '').trim()
  if (reason === 'other' && !trimmed) throw new Error('Add a note explaining the reason.')
  const name = nameOf(entry.vacated_profile_id) || 'This doctor'
  const sideEffects = emptySideEffects()
  const type = reason === 'sick' ? 'sick' : leaveType
  let leaveId = null
  if (stored === 'leave') {
    leaveId = existingLeaveId
    if (!leaveId) {
      const captured = await submitLeaveRequest({
        profileId: entry.vacated_profile_id, isAdmin: true, leaveType: type,
        dateFrom: entry.date, dateTo: entry.date, annualLeaveDays: type === 'annual' ? 1 : null,
        notes: trimmed, capturedBy: adminId,
      })
      leaveId = captured?.leaveRequestId ?? null
      sideEffects.leave_request_captured = leaveId
    }
  } else if (cancelLeave && entry.vacated_leave_request_id) {
    await cancelLeaveRequest(entry.vacated_leave_request_id, 'Reason changed on the roster')
    sideEffects.leave_request_cancelled = entry.vacated_leave_request_id
  }
  const patch = {
    vacated_reason: stored,
    vacated_note: stored === 'leave' ? null : (trimmed || null),
    vacated_leave_request_id: leaveId,
  }
  await updateEntry(entry.id, patch)
  const label = stored === 'leave' ? (LEAVE_TYPE_LABELS[type] || 'Leave') : { swap: 'Swap', no_show: 'No-show', other: 'Other reason' }[stored]
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: entry.id, entryDate: entry.date, shiftCode, action: 'assign',
    profileIdBefore: entry.profile_id ?? null, profileIdAfter: entry.profile_id ?? null, changedBy: adminId,
    reason: stored, note: `Reason changed to ${label.toLowerCase()}${trimmed && stored !== 'leave' ? `: ${trimmed}` : ''}`,
    leaveRequestId: leaveId, batchId,
    entryBefore: entrySnapshot(entry), entryAfter: entrySnapshot({ ...entry, ...patch }), sideEffects,
  })
  return {
    batchId,
    description: `${possessive(name)} reason on ${shiftLabel(entry.date, shiftCode)} is now ${label.toLowerCase()}${sideEffects.leave_request_cancelled ? '; their leave was cancelled' : ''}`,
    logError,
  }
}

// ── Move (drag and drop) ─────────────────────────────────────────────────
export async function moveEntry({ rosterMonthId, entry, shiftCodeBefore, targetDate, targetShiftCode, targetShiftTypeId, entries, adminId, nameOf, batchId = newBatchId() }) {
  if (findSameDayConflict({ entries, date: targetDate, profileId: entry.profile_id, excludeEntryId: entry.id })) {
    throw new Error(`${nameOf(entry.profile_id) || 'This doctor'} already has a shift on ${shortDate(targetDate)}.`)
  }
  const patch = { date: targetDate, shift_type_id: targetShiftTypeId, is_manual_override: true }
  await updateEntry(entry.id, patch)
  const entryAfter = { ...entry, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: entry.id,
    entryDate: targetDate,
    shiftCode: targetShiftCode,
    action: 'move',
    profileIdBefore: entry.profile_id,
    profileIdAfter: entry.profile_id,
    dateBefore: entry.date,
    shiftCodeBefore,
    changedBy: adminId,
    batchId,
    entryBefore: entrySnapshot(entry),
    entryAfter: entrySnapshot(entryAfter),
    sideEffects: emptySideEffects(),
  })
  return { batchId, description: `${holderName(entry, nameOf)} moved to ${shiftLabel(targetDate, targetShiftCode)}`, logError }
}

// ── Rearranging (not absences) ──────────────────────────────────────────
// A new open "[ ]" slot on a day and shift, for a slot a doctor moved off
// or was removed from and that is to be filled by a locum.
async function insertOpenSlot({ rosterMonthId, date, shiftCode, shiftTypeId, replacedProfileId = null, adminId, batchId }) {
  const { data, error } = await supabase.from('roster_entries')
    .insert({ roster_month_id: rosterMonthId, date, shift_type_id: shiftTypeId, ...OPEN_SLOT_PATCH, is_manual_override: true, position: 99 })
    .select('*').maybeSingle()
  if (error) throw new Error(error.message)
  const entryAfter = data ? { ...data, date: data.date?.slice(0, 10) } : null
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: entryAfter?.id ?? null, entryDate: date, shiftCode, action: 'slot_add',
    profileIdBefore: replacedProfileId, profileIdAfter: null, changedBy: adminId, batchId,
    entryBefore: null, entryAfter: entrySnapshot(entryAfter), sideEffects: emptySideEffects(),
  })
  return logError
}

// "Move to another shift": the doctor's own row goes to the new day and
// shift (their hours follow them), logged as a move so its hint reads
// "moved here from …". The slot they leave is, by `leave`:
//   'close'  left empty — the shift runs one short;
//   'fill'   taken by `cover` (a doctor or locum), "… replaced <them>";
//   'open'   an open "[ ]" locum slot.
// Never an absence: nobody is struck through. One batch, so one Undo.
export async function moveDoctor({ rosterMonthId, entry, shiftCode, targetDate, targetShiftCode, targetShiftTypeId, entries, leave = 'close', cover = null, adminId, nameOf, batchId = newBatchId() }) {
  if (!entry?.profile_id || entry.is_locum) throw new Error('Only a doctor on a shift can be moved this way.')
  if (targetDate === entry.date && targetShiftCode === shiftCode) throw new Error('Pick a different shift.')
  if (leave === 'fill' && !cover) throw new Error('Choose who takes the slot.')
  const moved = await moveEntry({ rosterMonthId, entry, shiftCodeBefore: shiftCode, targetDate, targetShiftCode, targetShiftTypeId, entries, adminId, nameOf, batchId })
  let tail = 'its slot is closed'
  let logError = moved.logError
  if (leave === 'fill') {
    const filled = await assignCover({ rosterMonthId, cover, date: entry.date, shiftCode, shiftTypeId: entry.shift_type_id, replacedProfileId: entry.profile_id, adminId, nameOf, batchId })
    logError = logError || filled.logError
    tail = `${coverName(cover, nameOf)} takes the slot`
  } else if (leave === 'open') {
    logError = logError || await insertOpenSlot({ rosterMonthId, date: entry.date, shiftCode, shiftTypeId: entry.shift_type_id, replacedProfileId: entry.profile_id, adminId, batchId })
    tail = 'its slot is open to a locum'
  }
  return { batchId, description: `${moved.description}; ${shiftLabel(entry.date, shiftCode)}: ${tail}`, logError }
}

// "Remove from this shift" (a reshuffle, not an absence): 'close' deletes
// the row (the shift runs short), 'open' turns it into an open "[ ]" slot.
export async function removeFromShift({ rosterMonthId, entry, shiftCode, mode = 'close', adminId, nameOf, batchId = newBatchId() }) {
  if (mode === 'close') return removeEntry({ rosterMonthId, entry, shiftCode, adminId, nameOf, batchId })
  const patch = { ...OPEN_SLOT_PATCH, is_manual_override: true, counts_toward_contract_hours: entry.counts_toward_contract_hours }
  await updateEntry(entry.id, patch)
  const entryAfter = { ...entry, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: entry.id, entryDate: entry.date, shiftCode, action: 'remove',
    profileIdBefore: entry.profile_id, profileIdAfter: null, changedBy: adminId, batchId,
    entryBefore: entrySnapshot(entry), entryAfter: entrySnapshot(entryAfter), sideEffects: emptySideEffects(),
  })
  return { batchId, description: `${holderName(entry, nameOf)} removed from ${shiftLabel(entry.date, shiftCode)}; the slot is open to a locum`, logError }
}

// ── Swap two doctors' shifts ─────────────────────────────────────────────
// Each doctor takes the other's shift — the same day or two different
// days. Both rows keep their slot, times and history; only who holds them
// changes. Refused when either doctor would end up with two shifts on one
// day, or is on approved leave on the shift they'd take. Two log rows under
// one batch, so Undo puts both back together.
export function swapProblem({ a, b, entries, nameOf, isOnLeave = () => false }) {
  if (!a?.profile_id || !b?.profile_id || a.is_locum || b.is_locum) return 'Only two doctors\' shifts can be swapped.'
  if (a.id === b.id) return 'Pick a different shift.'
  if (a.profile_id === b.profile_id) return 'Both shifts belong to the same doctor.'
  const others = entries.filter(e => e.id !== a.id && e.id !== b.id)
  const clash = (profileId, date) => others.some(e => e.date === date && e.profile_id === profileId)
  const nameA = nameOf(a.profile_id) || 'The first doctor'
  const nameB = nameOf(b.profile_id) || 'The other doctor'
  if (clash(a.profile_id, b.date)) return `${nameA} already has another shift on ${shortDate(b.date)}.`
  if (clash(b.profile_id, a.date)) return `${nameB} already has another shift on ${shortDate(a.date)}.`
  if (isOnLeave(a.profile_id, b.date)) return `${nameA} is on approved leave on ${shortDate(b.date)}.`
  if (isOnLeave(b.profile_id, a.date)) return `${nameB} is on approved leave on ${shortDate(a.date)}.`
  return null
}

export async function swapEntries({ rosterMonthId, a, b, shiftCodeA, shiftCodeB, entries, note = null, isOnLeave, adminId, nameOf, batchId = newBatchId() }) {
  const problem = swapProblem({ a, b, entries, nameOf, isOnLeave })
  if (problem) throw new Error(problem)
  const patchA = { profile_id: b.profile_id, is_manual_override: true }
  const patchB = { profile_id: a.profile_id, is_manual_override: true }
  await updateEntry(a.id, patchA)
  try {
    await updateEntry(b.id, patchB)
  } catch (err) {
    await updateEntry(a.id, { profile_id: a.profile_id, is_manual_override: a.is_manual_override ?? false }).catch(() => {})
    throw err
  }
  const log = (entry, shiftCode, patch) => logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: entry.id,
    entryDate: entry.date,
    shiftCode,
    action: 'assign',
    profileIdBefore: entry.profile_id,
    profileIdAfter: patch.profile_id,
    reason: 'swap',
    note,
    changedBy: adminId,
    batchId,
    entryBefore: entrySnapshot(entry),
    entryAfter: entrySnapshot({ ...entry, ...patch }),
    sideEffects: emptySideEffects(),
  })
  const [logA, logB] = await Promise.all([log(a, shiftCodeA, patchA), log(b, shiftCodeB, patchB)])
  const nameA = nameOf(a.profile_id) || 'Doctor'
  const nameB = nameOf(b.profile_id) || 'Doctor'
  return {
    batchId,
    description: `${nameA} and ${nameB} swapped: ${nameB} on ${shiftLabel(a.date, shiftCodeA)}, ${nameA} on ${shiftLabel(b.date, shiftCodeB)}`,
    logError: logA.error || logB.error || null,
  }
}

// ── The locum slot beside a vacated doctor ───────────────────────────────
// Cover added to a no-cover row: a replacement now, an advertised slot, or
// an open slot nobody is told about.
export async function addCover({ rosterMonthId, entry, shiftCode, mode, cover = null, adminId, nameOf, batchId = newBatchId() }) {
  if (!isNoCoverRow(entry)) throw new Error('This shift already has a slot or someone on it.')
  if (mode === 'replace') {
    if (!cover) throw new Error('Choose who is taking over the shift.')
    return assignCover({ rosterMonthId, cover, date: entry.date, shiftCode, shiftTypeId: entry.shift_type_id, entryBefore: entry, adminId, nameOf, batchId })
  }
  const patch = { ...OPEN_SLOT_PATCH, counts_toward_contract_hours: entry.counts_toward_contract_hours }
  await updateEntry(entry.id, patch)
  const sideEffects = emptySideEffects()
  if (mode === 'advertise') sideEffects.advert_created = await insertAdvert(entry.id, adminId)
  const entryAfter = { ...entry, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: entry.id,
    entryDate: entry.date,
    shiftCode,
    action: 'slot_add',
    profileIdBefore: entry.vacated_profile_id,
    profileIdAfter: null,
    advertised: mode === 'advertise',
    changedBy: adminId,
    batchId,
    entryBefore: entrySnapshot(entry),
    entryAfter: entrySnapshot(entryAfter),
    sideEffects,
  })
  const name = nameOf(entry.vacated_profile_id) || 'the doctor'
  return {
    batchId,
    description: mode === 'advertise'
      ? `Locum slot opened and advertised for ${possessive(name)} ${shiftLabel(entry.date, shiftCode)}`
      : `Locum slot opened for ${possessive(name)} ${shiftLabel(entry.date, shiftCode)}`,
    logError,
  }
}

// The open "[ ]" slot removed; the struck-through name stays. Any open
// advert is cancelled.
export async function removeSlot({ rosterMonthId, entry, shiftCode, adminId, nameOf, batchId = newBatchId() }) {
  if (!entry.vacated_profile_id) throw new Error('Nobody was taken off this shift, so there is no name to keep. Remove the slot instead.')
  if (!isOpenLocumSlot(entry)) throw new Error('This slot is filled. Remove the locum first.')
  const sideEffects = emptySideEffects()
  sideEffects.adverts_cancelled = await cancelOpenAdverts(entry.id)
  const patch = { ...NO_COVER_PATCH, counts_toward_contract_hours: entry.counts_toward_contract_hours }
  await updateEntry(entry.id, patch)
  const entryAfter = { ...entry, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: entry.id,
    entryDate: entry.date,
    shiftCode,
    action: 'slot_remove',
    profileIdBefore: entry.vacated_profile_id,
    profileIdAfter: null,
    changedBy: adminId,
    batchId,
    entryBefore: entrySnapshot(entry),
    entryAfter: entrySnapshot(entryAfter),
    sideEffects,
  })
  const name = nameOf(entry.vacated_profile_id) || 'the doctor'
  return { batchId, description: `Locum slot removed from ${shiftLabel(entry.date, shiftCode)}; ${name} stays struck through`, logError }
}

// ── Advertise / stop ─────────────────────────────────────────────────────
export async function advertise({ rosterMonthId, entry, shiftCode, adminId, batchId = newBatchId() }) {
  if (!isOpenLocumSlot(entry)) throw new Error('Only an open locum slot can be advertised.')
  if ((await fetchOpenAdvertIds(entry.id)).length > 0) throw new Error('This slot is already advertised.')
  const sideEffects = emptySideEffects()
  sideEffects.advert_created = await insertAdvert(entry.id, adminId)
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: entry.id, entryDate: entry.date, shiftCode, action: 'advertise',
    profileIdBefore: entry.vacated_profile_id ?? null, profileIdAfter: null, advertised: true, changedBy: adminId,
    batchId, entryBefore: entrySnapshot(entry), entryAfter: entrySnapshot(entry), sideEffects,
  })
  return { batchId, description: `${shiftLabel(entry.date, shiftCode)} advertised to locums`, logError }
}

export async function unadvertise({ rosterMonthId, entry, shiftCode, adminId, batchId = newBatchId() }) {
  const sideEffects = emptySideEffects()
  sideEffects.adverts_cancelled = await cancelOpenAdverts(entry.id)
  if (sideEffects.adverts_cancelled.length === 0) throw new Error('This slot is not advertised.')
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: entry.id, entryDate: entry.date, shiftCode, action: 'unadvertise',
    profileIdBefore: entry.vacated_profile_id ?? null, profileIdAfter: null, changedBy: adminId,
    batchId, entryBefore: entrySnapshot(entry), entryAfter: entrySnapshot(entry), sideEffects,
  })
  return { batchId, description: `Advert stopped for ${shiftLabel(entry.date, shiftCode)}`, logError }
}

// ── Put back ─────────────────────────────────────────────────────────────
// Which refusal, if any, "Put back" meets — checked before the menu offers
// it, and again when it runs.
export function reinstateBlocker({ entry, entries, nameOf, overCover = false }) {
  if (!entry?.vacated_profile_id) return 'Nobody was taken off this shift.'
  const name = nameOf(entry.vacated_profile_id) || 'This doctor'
  if (findSameDayConflict({ entries, date: entry.date, profileId: entry.vacated_profile_id, excludeEntryId: entry.id })) {
    return `${name} now has another shift on ${shortDate(entry.date)}, so they cannot be put back on this one.`
  }
  if (!overCover && (entry.profile_id || (entry.is_locum && locumDisplayName(entry.locum_name)))) {
    return `This shift has since been filled by ${holderName(entry, nameOf)}. Remove them first to put ${name} back.`
  }
  return null
}

// The linked leave, as the roster can read it: [from, to, type, id] or null.
export function reinstateLeave({ entry, leaveByProfile }) {
  if (!entry?.vacated_leave_request_id) return null
  const ranges = leaveByProfile?.[entry.vacated_profile_id] || []
  const range = ranges.find(r => r[3] === entry.vacated_leave_request_id)
  return range || [null, null, null, entry.vacated_leave_request_id]
}

// The linked leave, described: { type, dates, multiDay }. A leave that
// covers only this shift's day is cancelled along with the put-back (a
// doctor back on the shift is not on leave); one that runs over more
// days has other days the admin must decide about, so Put back asks.
export function describeLinkedLeave({ entry, leaveByProfile }) {
  const leave = reinstateLeave({ entry, leaveByProfile })
  if (!leave) return null
  const type = ((leave[2] && LEAVE_TYPE_LABELS[leave[2]]) || 'leave').toLowerCase()
  const known = Boolean(leave[0] && leave[1])
  const multiDay = known && leave[0] !== leave[1]
  const dates = known ? (multiDay ? `${shortDate(leave[0])} – ${shortDate(leave[1])}` : shortDate(leave[0])) : shortDate(entry.date)
  return { type, dates, multiDay }
}

export function leaveQuestion({ entry, leaveByProfile, nameOf }) {
  const leave = describeLinkedLeave({ entry, leaveByProfile })
  if (!leave) return null
  const who = possessive(nameOf(entry.vacated_profile_id) || 'this doctor')
  return leave.multiDay
    ? `${who} ${leave.type} runs ${leave.dates}. Cancel all of it, or keep the other days?`
    : `Also cancel ${who} ${leave.type} for ${leave.dates}?`
}

// `overCover`: Replace → "Put <doctor> back" on a shift someone now covers;
// the cover comes off (and any advert stops) as the doctor goes back on.
export async function reinstate({ rosterMonthId, entry, shiftCode, entries, cancelLeave = false, overCover = false, adminId, nameOf, batchId = newBatchId() }) {
  // Re-read the row: the guard must see the slot as it is now, not as the
  // menu saw it when it opened.
  const fresh = (await fetchEntry(entry.id)) || entry
  const blocker = reinstateBlocker({ entry: fresh, entries, nameOf, overCover })
  if (blocker) throw new Error(blocker)
  const sideEffects = emptySideEffects()
  sideEffects.adverts_cancelled = await cancelOpenAdverts(fresh.id)
  const coverRemoved = overCover && (fresh.profile_id || (fresh.is_locum && locumDisplayName(fresh.locum_name))) ? holderName(fresh, nameOf) : null
  const patch = {
    profile_id: fresh.vacated_profile_id,
    is_locum: false,
    locum_name: null,
    locum_contact_id: null,
    counts_toward_contract_hours: true,
    is_manual_override: true,
    is_flagged: false,
    flag_type: null,
    flag_reason: null,
    vacated_profile_id: null,
    vacated_reason: null,
    vacated_note: null,
    vacated_leave_request_id: null,
    vacated_by: null,
    vacated_at: null,
  }
  await updateEntry(fresh.id, patch)
  if (cancelLeave && fresh.vacated_leave_request_id) {
    await cancelLeaveRequest(fresh.vacated_leave_request_id, 'Put back on the roster')
    sideEffects.leave_request_cancelled = fresh.vacated_leave_request_id
  }
  const entryAfter = { ...fresh, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: fresh.id, entryDate: fresh.date, shiftCode, action: 'reinstate',
    profileIdBefore: fresh.vacated_profile_id, profileIdAfter: fresh.vacated_profile_id, changedBy: adminId,
    note: cancelLeave && fresh.vacated_leave_request_id ? 'Leave cancelled' : (fresh.vacated_leave_request_id ? 'Leave kept' : null),
    batchId, entryBefore: entrySnapshot(fresh), entryAfter: entrySnapshot(entryAfter), sideEffects,
  })
  const name = nameOf(fresh.vacated_profile_id) || 'Doctor'
  return {
    batchId,
    description: `${name} put back on ${shiftLabel(fresh.date, shiftCode)}${coverRemoved ? ` in place of ${coverRemoved}` : ''}${sideEffects.leave_request_cancelled ? '; their leave was cancelled' : ''}`,
    logError,
  }
}

// ── The shifts a leave took a doctor off ─────────────────────────────────
// For "Cancel this leave?" anywhere in the app: every roster shift (not in
// the bin) the doctor was taken off for this leave, with who covers it and
// whether putting them back is possible. [{ entry, shiftCode, rosterMonthId,
// cover, blocker }], oldest first.
export async function fetchLeaveShifts(leaveRequestId) {
  if (!leaveRequestId) return []
  const { data, error } = await supabase
    .from('roster_entries')
    .select('*, shift_types(code), roster_months!inner(deleted_at), holder:profiles!roster_entries_profile_id_fkey(name, surname), absent:profiles!roster_entries_vacated_profile_id_fkey(name, surname)')
    .eq('vacated_leave_request_id', leaveRequestId)
    .is('roster_months.deleted_at', null)
  if (error || !data?.length) return []
  const rows = data.map(r => ({ ...r, date: r.date?.slice(0, 10) }))
  const doctorId = rows[0].vacated_profile_id
  const { data: others } = await supabase
    .from('roster_entries').select('id, date, profile_id, roster_months!inner(deleted_at)')
    .eq('profile_id', doctorId).in('date', [...new Set(rows.map(r => r.date))]).is('roster_months.deleted_at', null)
  const name = `${rows[0].absent?.name || ''} ${rows[0].absent?.surname || ''}`.trim() || 'This doctor'
  return rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => {
      const coverName = entry.is_locum
        ? (locumDisplayName(entry.locum_name) ? `${locumDisplayName(entry.locum_name)} (locum)` : 'open locum slot')
        : entry.profile_id ? `${entry.holder?.name || ''} ${entry.holder?.surname || ''}`.trim() : null
      const clash = (others || []).some(o => o.date === entry.date && o.id !== entry.id)
      const { shift_types: st, roster_months: _rm, holder: _h, absent: _a, ...row } = entry // eslint-disable-line no-unused-vars
      return {
        entry: row,
        shiftCode: st?.code || 'UNKNOWN',
        rosterMonthId: entry.roster_month_id,
        cover: coverName,
        blocker: clash ? `${name} has another shift on ${shortDate(entry.date)}` : null,
      }
    })
}

// ── After leave is cancelled from the roster ────────────────────────────
// A shift the doctor was taken off FOR this leave (vacated_leave_request_id)
// gets one of two outcomes, chosen when the leave is cancelled:
//   undoShift true   the doctor goes back on it; any cover is removed and
//                    any advert stopped — as if the leave never happened
//   undoShift false  the shift stays as it is (the cover works it) and its
//                    reason stops saying leave, since there is none now
// Refused for undoShift when the doctor has another shift that day.
export function leaveShiftBlocker({ entry, entries, nameOf }) {
  if (!entry?.vacated_profile_id) return null
  if (findSameDayConflict({ entries, date: entry.date, profileId: entry.vacated_profile_id, excludeEntryId: entry.id })) {
    return `${nameOf(entry.vacated_profile_id) || 'This doctor'} has another shift on ${shortDate(entry.date)}`
  }
  return null
}

export async function afterLeaveCancelled({ rosterMonthId, entry, shiftCode, entries, undoShift, adminId, nameOf, batchId = newBatchId() }) {
  const fresh = (await fetchEntry(entry.id)) || entry
  const name = nameOf(fresh.vacated_profile_id) || 'Doctor'
  const sideEffects = emptySideEffects()
  let patch
  if (undoShift) {
    const blocker = leaveShiftBlocker({ entry: fresh, entries, nameOf })
    if (blocker) throw new Error(`${blocker}, so they cannot go back on ${shiftLabel(fresh.date, shiftCode)}.`)
    sideEffects.adverts_cancelled = await cancelOpenAdverts(fresh.id)
    patch = {
      profile_id: fresh.vacated_profile_id, is_locum: false, locum_name: null, locum_contact_id: null,
      counts_toward_contract_hours: true, is_manual_override: true, is_flagged: false, flag_type: null, flag_reason: null,
      vacated_profile_id: null, vacated_reason: null, vacated_note: null, vacated_leave_request_id: null, vacated_by: null, vacated_at: null,
    }
  } else {
    patch = { vacated_reason: 'other', vacated_note: 'Leave cancelled; cover kept', vacated_leave_request_id: null }
  }
  await updateEntry(fresh.id, patch)
  const entryAfter = { ...fresh, ...patch }
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: fresh.id, entryDate: fresh.date, shiftCode,
    action: undoShift ? 'reinstate' : 'assign',
    profileIdBefore: undoShift ? fresh.vacated_profile_id : fresh.profile_id,
    profileIdAfter: undoShift ? fresh.vacated_profile_id : fresh.profile_id,
    reason: undoShift ? null : 'other',
    note: undoShift ? 'Leave cancelled; cover removed' : 'Leave cancelled; cover kept',
    changedBy: adminId, batchId, entryBefore: entrySnapshot(fresh), entryAfter: entrySnapshot(entryAfter), sideEffects,
  })
  return {
    batchId,
    description: undoShift
      ? `${name} back on ${shiftLabel(fresh.date, shiftCode)}; the cover was removed`
      : `${shiftLabel(fresh.date, shiftCode)} kept as it is`,
    logError,
  }
}

// ── Adjusted times ───────────────────────────────────────────────────────
// A doctor or locum works this shift at different hours to its standard
// ones. "HH:MM" inputs; both empty returns the shift to standard times. The
// row keeps its shift type. Logged as a move of nothing — the same row,
// the same date and shift — so History reads "times changed".
export async function changeTimes({ rosterMonthId, entry, shiftCode, start, end, adminId, nameOf, batchId = newBatchId() }) {
  if (!entry.profile_id && !entry.is_locum) throw new Error('Nobody is on this shift to change times for.')
  const problem = validateTimes(start, end)
  if (problem) throw new Error(problem)
  const toSql = t => (t ? (t.length === 5 ? `${t}:00` : t) : null)
  const patch = { start_time_override: toSql(start), end_time_override: toSql(end), is_manual_override: true }
  await updateEntry(entry.id, patch)
  const entryAfter = { ...entry, ...patch }
  const label = adjustedTimesLabel(entryAfter)
  const { error: logError } = await logRosterEntryChange({
    rosterMonthId, rosterEntryId: entry.id, entryDate: entry.date, shiftCode, action: 'times',
    profileIdBefore: entry.profile_id, profileIdAfter: entry.profile_id, changedBy: adminId,
    note: label ? `Times ${label}` : 'Standard times',
    locumName: entry.is_locum && !entry.profile_id ? locumDisplayName(entry.locum_name) || null : null,
    batchId, entryBefore: entrySnapshot(entry), entryAfter: entrySnapshot(entryAfter), sideEffects: emptySideEffects(),
  })
  const who = holderName(entry, nameOf) || 'This shift'
  return {
    batchId,
    description: label ? `${who} now works ${label} on ${shiftLabel(entry.date, shiftCode)}` : `${who} back on standard times for ${shiftLabel(entry.date, shiftCode)}`,
    logError,
  }
}
