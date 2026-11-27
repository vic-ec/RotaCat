import { shortDate } from './reviewLog'
import { locumDisplayName } from './locumCover'
import { adjustedTimesLabel } from './shiftTimes'
import { LEAVE_TYPE_LABELS } from './leaveRequests'
import { labelForShiftCode } from './shiftLabels'

// What the roster's edit marker (a small pen on a name) says: who is on the
// shift and how they got there, for a shift changed by hand. Null for a
// shift as generated or as first entered, which gets no marker and no hint.
const REASONS = { leave: 'leave', swap: 'swap', no_show: 'no-show', other: 'other reason' }

export function isEditedEntry(entry) {
  return Boolean(entry && (entry.is_manual_override || entry.vacated_profile_id || entry.start_time_override))
}

// `change`: the newest roster_entry_changes row for this entry (admins
// only — see fetchLatestChangeByEntry), or undefined. `nameOf(id)` the
// doctor's full name.
// `leaveType`: the leave the covered doctor was taken off for, when the
// reason is leave — "Alli (locum) covering Cara Landes — sick leave".
function leaveWords(leaveType) {
  if (leaveType === 'cancelled') return 'leave, since cancelled'
  const label = LEAVE_TYPE_LABELS[leaveType]
  if (!label) return 'leave'
  const lower = label.charAt(0).toLowerCase() + label.slice(1)
  return /leave$/i.test(lower) ? lower : `${lower} leave`
}

export function editHint({ entry, change, nameOf, leaveType = null }) {
  if (!isEditedEntry(entry)) return null
  const holder = entry.is_locum
    ? (locumDisplayName(entry.locum_name) ? `${locumDisplayName(entry.locum_name)} (locum)` : 'Open slot')
    : (nameOf(entry.profile_id) || 'This doctor')
  let text
  if (entry.vacated_profile_id) {
    const reason = entry.vacated_reason === 'leave'
      ? ` — ${leaveWords(leaveType)}`
      : REASONS[entry.vacated_reason] ? ` — ${REASONS[entry.vacated_reason]}` : ''
    text = `${holder} covering ${nameOf(entry.vacated_profile_id) || 'a doctor'}${reason}`
  } else if (change?.action === 'move' && change.date_before) {
    text = `${holder}, moved here from ${shortDate(change.date_before)}${change.shift_code_before ? ` ${labelForShiftCode(change.shift_code_before)}` : ''}`
  } else if (change?.reason === 'swap') {
    const before = change.profile_id_before && change.profile_id_before !== entry.profile_id ? nameOf(change.profile_id_before) : null
    text = before ? `${holder}, swapped with ${before}` : `${holder}, swapped in`
  } else if (change?.action === 'reinstate') {
    text = `${holder}, put back on this shift`
  } else if (change?.profile_id_before && change.profile_id_before !== entry.profile_id) {
    text = `${holder} replaced ${nameOf(change.profile_id_before) || 'another doctor'}`
  } else if (change) {
    text = `${holder}, added by hand`
  } else {
    text = `${holder}, changed by hand`
  }
  const times = adjustedTimesLabel(entry)
  // Who made the change and when, where the log says.
  const by = change?.changed_by ? nameOf(change.changed_by) : null
  const when = change?.changed_at ? shortDate(String(change.changed_at).slice(0, 10)) : null
  const stamp = by && when ? ` · ${by}, ${when}` : ''
  return `${times ? `${text} · works ${times}` : text}${stamp}`
}
