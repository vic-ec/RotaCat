import { supabase } from './supabase'
import { datesInRange, formatShortDateRange } from './dateRange'
import { submitLeaveRequest, LEAVE_TYPE_LABELS, LEAVE_TYPE_OPTIONS } from './leaveRequests'
import { logRosterEntryChange } from './changeLog'
import { leaveRangeOn } from './approvedLeave'

// Detects whether a doctor being swapped into a vacated published-roster
// slot already has a different shift that same day — the trigger for the
// recursive re-entrant modal (swapping them in implicitly vacates their own
// existing shift, which then needs its own open/advertise/swap decision).
export function findSameDayConflict({ entries, date, profileId, excludeEntryId }) {
  return entries.find(e => e.date === date && e.profile_id === profileId && e.id !== excludeEntryId) || null
}

// What the admin picks in the dialog. Stored coarser than this: both leave
// options are 'leave' on the roster row (see VACATED_REASON below), so the
// roster itself never says which leave.
export const VACANCY_REASON_OPTIONS = [
  { value: 'sick', label: 'Sick leave' },
  { value: 'leave', label: 'Other leave' },
  { value: 'swap', label: 'Swap' },
  { value: 'no_show', label: 'No-show' },
  { value: 'other', label: 'Other reason' },
]
const VACATED_REASON = { sick: 'leave', leave: 'leave', swap: 'swap', no_show: 'no_show', other: 'other' }

// "Other leave" on the roster: everything but sick (its own option) and a
// weekend off (a planner arrangement, not a reason to come off one shift).
export const VACANCY_LEAVE_TYPE_OPTIONS = LEAVE_TYPE_OPTIONS.filter(o => o.value !== 'sick' && o.value !== 'weekend_exception')

export const VACATE_PATCH = {
  profile_id: null,
  is_locum: false,
  locum_name: null,
  is_manual_override: false,
  is_flagged: false,
  flag_type: null,
  flag_reason: null,
}

// One save for the whole "a doctor comes off a published shift" action:
// capture their leave (when that is the reason and none is on record yet),
// hand the shift to a replacement or open it, and log who, what and why.
//
// Order matters, since these are separate writes and not one transaction:
// the leave goes first because it is the step most likely to be refused
// (it overlaps leave already on record, or is over capacity with no note),
// and a refusal there leaves the roster untouched. Throws with a
// user-facing message.
//
//   reason   one of VACANCY_REASON_OPTIONS' values
//   cover    'replace' (replacementId required) | 'advertise' | 'open'
//   existingLeaveId  the doctor's approved leave already covering this
//                    date, if any: linked, and no second row is filed
export async function resolveVacancy({
  rosterMonthId, vacancy, reason, leaveType = 'sick', dateFrom, dateTo, note = '', cover, replacementId = null,
  existingLeaveId = null, adminId,
}) {
  const storedReason = VACATED_REASON[reason]
  if (!storedReason) throw new Error('Choose why this doctor is coming off the shift.')
  if (!['replace', 'advertise', 'open'].includes(cover)) throw new Error('Choose what happens to the shift.')
  if (cover === 'replace' && !replacementId) throw new Error('Choose the doctor taking over the shift.')
  const trimmedNote = (note || '').trim()
  if (reason === 'other' && !trimmedNote) throw new Error('Add a note explaining the reason.')

  const isLeave = storedReason === 'leave'
  let leaveRequestId = existingLeaveId
  if (isLeave && !existingLeaveId) {
    if (!dateFrom || !dateTo || dateFrom > vacancy.date || dateTo < vacancy.date) {
      throw new Error('The leave dates must include the date of this shift.')
    }
    const captured = await submitLeaveRequest({
      profileId: vacancy.currentProfileId,
      isAdmin: true,
      leaveType,
      dateFrom,
      dateTo,
      annualLeaveDays: leaveType === 'annual' ? datesInRange(dateFrom, dateTo).length : null,
      notes: trimmedNote,
      capturedBy: adminId,
    })
    leaveRequestId = captured?.leaveRequestId ?? null
  }

  const patch = {
    ...(cover === 'replace'
      ? { ...VACATE_PATCH, profile_id: replacementId, is_manual_override: true }
      : VACATE_PATCH),
    vacated_profile_id: vacancy.currentProfileId,
    vacated_reason: storedReason,
    // A leave note lives on the leave request, under that table's own
    // access rules — never on the roster row, which every approved user
    // can read.
    vacated_note: isLeave ? null : (trimmedNote || null),
    vacated_leave_request_id: leaveRequestId,
    vacated_by: adminId,
    vacated_at: new Date().toISOString(),
  }
  const { error: updateErr } = await supabase.from('roster_entries').update(patch).eq('id', vacancy.entryId)
  if (updateErr) throw new Error(updateErr.message)

  if (cover === 'advertise') {
    const { error: adErr } = await supabase.from('shift_advertisements').insert({
      roster_entry_id: vacancy.entryId,
      advertised_by: adminId,
      status: 'open',
    })
    if (adErr) throw new Error(adErr.message)
  }

  const leaveLabel = isLeave ? (LEAVE_TYPE_LABELS[leaveType] || 'Leave') : null
  await logRosterEntryChange({
    rosterMonthId,
    rosterEntryId: vacancy.entryId,
    entryDate: vacancy.date,
    shiftCode: vacancy.shiftCode,
    action: cover === 'replace' ? 'assign' : 'unassign',
    profileIdBefore: vacancy.currentProfileId,
    profileIdAfter: cover === 'replace' ? replacementId : null,
    advertised: cover === 'advertise',
    changedBy: adminId,
    reason: storedReason,
    // The log is admin-only, so it can name the leave type the roster row
    // does not.
    note: isLeave ? (existingLeaveId ? 'Leave already on record' : leaveLabel) : (trimmedNote || null),
    leaveRequestId,
  })

  return { patch, leaveRequestId }
}

// ── Reading an absence off the roster ─────────────────────────────────────
// Two ways a shift shows a struck-through name:
//
//   vacated   the doctor was taken off it through the dialog above. The row
//             now belongs to whoever covers it (or to nobody); the original
//             doctor is kept in vacated_profile_id. A plain swap is not an
//             absence and is not shown: it is in the change log.
//   on_leave  the doctor still holds the shift but has approved leave over
//             its date (leave captured without touching the roster).
//
// Returns null when the entry shows nothing unusual.
export function entryAbsence(entry, leaveByProfile) {
  if (!entry) return null
  if (entry.vacated_profile_id && entry.vacated_reason && entry.vacated_reason !== 'swap') {
    return {
      kind: 'vacated',
      profileId: entry.vacated_profile_id,
      reason: entry.vacated_reason,
      leaveRequestId: entry.vacated_leave_request_id || null,
      note: entry.vacated_note || null,
      byId: entry.vacated_by || null,
      open: !entry.profile_id && !entry.is_locum,
    }
  }
  const range = leaveRangeOn(leaveByProfile, entry.profile_id, entry.date)
  if (range) {
    return { kind: 'on_leave', profileId: entry.profile_id, reason: 'leave', leaveRange: range }
  }
  return null
}

// The leave row behind an absence, as this viewer may see it: [from, to,
// type, id], or null (not leave, or leave they are not allowed to see).
export function absenceLeaveRange(absence, leaveByProfile) {
  if (!absence || absence.reason !== 'leave') return null
  if (absence.leaveRange) return absence.leaveRange
  const ranges = leaveByProfile?.[absence.profileId] || []
  return ranges.find(r => r[3] && r[3] === absence.leaveRequestId) || null
}

// What the popup says. `canSeeNote`: admins only (a no-show note is not for
// the whole department).
export function absenceSummary({ absence, leaveByProfile, doctorName, coverName, byName, canSeeNote = false }) {
  const range = absenceLeaveRange(absence, leaveByProfile)
  let headline
  if (absence.reason === 'leave') headline = (range?.[2] && LEAVE_TYPE_LABELS[range[2]]) || 'On leave'
  else if (absence.reason === 'no_show') headline = 'No-show'
  else headline = 'Taken off this shift'

  const lines = []
  if (range) lines.push(formatShortDateRange(range[0], range[1]))
  if (absence.kind === 'vacated') {
    lines.push(coverName ? `Covered by ${coverName}` : absence.open ? 'Shift open — no cover yet' : 'Covered by a locum')
    if (byName) lines.push(`Recorded by ${byName}`)
  } else {
    lines.push('Still on the roster for this shift')
  }
  if (canSeeNote && absence.note) lines.push(`Note: ${absence.note}`)
  return { doctorName: doctorName || 'This doctor', headline, lines }
}

// True when a roster entry's hours should not count for the doctor on it:
// they hold approved leave over its date.
export function isEntryOnLeave(entry, leaveByProfile) {
  return Boolean(leaveRangeOn(leaveByProfile, entry?.profile_id, entry?.date?.slice?.(0, 10) ?? entry?.date))
}
