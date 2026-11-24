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
import { LEAVE_TYPE_LABELS } from './leaveRequests'
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
export async function assignCover({ rosterMonthId, cover, date, shiftCode, shiftTypeId, entryBefore = null, adminId, nameOf, batchId = newBatchId() }) {
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
    profileIdBefore: entryBefore?.profile_id ?? entryBefore?.vacated_profile_id ?? null,
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
export function reinstateBlocker({ entry, entries, nameOf }) {
  if (!entry?.vacated_profile_id) return 'Nobody was taken off this shift.'
  const name = nameOf(entry.vacated_profile_id) || 'This doctor'
  if (findSameDayConflict({ entries, date: entry.date, profileId: entry.vacated_profile_id, excludeEntryId: entry.id })) {
    return `${name} now has another shift on ${shortDate(entry.date)}, so they cannot be put back on this one.`
  }
  if (entry.profile_id || (entry.is_locum && locumDisplayName(entry.locum_name))) {
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

export async function reinstate({ rosterMonthId, entry, shiftCode, entries, cancelLeave = false, adminId, nameOf, batchId = newBatchId() }) {
  // Re-read the row: the guard must see the slot as it is now, not as the
  // menu saw it when it opened.
  const fresh = (await fetchEntry(entry.id)) || entry
  const blocker = reinstateBlocker({ entry: fresh, entries, nameOf })
  if (blocker) throw new Error(blocker)
  const sideEffects = emptySideEffects()
  sideEffects.adverts_cancelled = await cancelOpenAdverts(fresh.id)
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
    description: `${name} put back on ${shiftLabel(fresh.date, shiftCode)}${sideEffects.leave_request_cancelled ? '; their leave was cancelled' : ''}`,
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
