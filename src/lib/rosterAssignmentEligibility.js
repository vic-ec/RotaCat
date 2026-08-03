import { addDays } from './dateRange'

// The four night-shift codes across the day-type shift patterns (see
// RosterGridPage's WEEKDAY_SHIFTS/WEEKEND_SHIFTS/PH_WEEKDAY_SHIFTS/
// PH_WEEKEND_SHIFTS) — a doctor working one of these needs the following
// calendar day off (post-call rest), so they shouldn't appear in any of
// that next day's assignment dropdowns.
export const NIGHT_SHIFT_CODES = new Set(['WD_22', 'WE_20', 'PHW_22', 'PH_20'])

export function workedNightShiftPreviousDay({ entries, shiftTypes, date, profileId }) {
  const prevDate = addDays(date, -1)
  return entries.some(e =>
    e.date === prevDate
    && e.profile_id === profileId
    && NIGHT_SHIFT_CODES.has(shiftTypes[e.shift_type_id]))
}

// leaveByProfile: { [profileId]: [[dateFrom, dateTo], ...] } of approved
// leave ranges overlapping the roster month — see loadAll's leave fetch.
export function isOnApprovedLeave({ leaveByProfile, profileId, date }) {
  const ranges = leaveByProfile[profileId]
  if (!ranges) return false
  return ranges.some(([from, to]) => date >= from && date <= to)
}
