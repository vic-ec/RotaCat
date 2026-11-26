import { shortDate } from './reviewLog'
import { locumDisplayName } from './locumCover'
import { adjustedTimesLabel } from './shiftTimes'

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
export function editHint({ entry, change, nameOf }) {
  if (!isEditedEntry(entry)) return null
  const holder = entry.is_locum
    ? (locumDisplayName(entry.locum_name) ? `${locumDisplayName(entry.locum_name)} (locum)` : 'Open slot')
    : (nameOf(entry.profile_id) || 'This doctor')
  let text
  if (entry.vacated_profile_id) {
    const reason = REASONS[entry.vacated_reason] ? ` — ${REASONS[entry.vacated_reason]}` : ''
    text = `${holder} covering ${nameOf(entry.vacated_profile_id) || 'a doctor'}${reason}`
  } else if (change?.action === 'move' && change.date_before) {
    text = `${holder}, moved here from ${shortDate(change.date_before)}`
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
  return times ? `${text} · works ${times}` : text
}
