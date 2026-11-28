// Constant lists and small helpers for the roster grid page
// (RosterGridPage and its pieces in this folder), moved here as they were.
import { Rows3, Columns3 } from 'lucide-react'
import { shiftColumns } from '../../lib/shiftLabels'

// Two ways to read the same month. Rows is the day-by-day grid the roster
// has always been; Lanes turns it ninety degrees, a row per doctor. Both
// are the same data and the same filters — only the axis changes.
export const ROSTER_LAYOUTS = [
  { key: 'rows', label: 'Rows', icon: Rows3, title: 'Rows' },
  { key: 'lanes', label: 'Lanes', icon: Columns3, title: 'Lanes' },
]

// How much of the month is on screen: "Month"/"Week" in full from lg (the
// desktop), one letter each below it, not a calendar glyph — two calendars
// differing only in how many rows they draw are indistinguishable at 14px,
// and at that size M and W are the two most different letters in the
// alphabet. The letter keeps the toolbar on one line on a phone; `title`
// gives the word on a tap.
export const ROSTER_RANGES = [
  { key: 'month', label: 'Month', shortLabel: 'M', title: 'Month' },
  { key: 'week', label: 'Week', shortLabel: 'W', title: 'Week' },
]

// A ⅝-contract doctor the Weekend Planner doesn't name at all this month is
// rostered on weekends by their own alternating cadence, so the planner has
// nothing to compare them with. One it names on any weekend follows the
// planner like everyone else (RotaCatScheduler, _uses_weekend_planner) and
// IS compared. See computeWeekendPlannerDrift.
export function outsidePlannerIds(profiles, plannerEntries) {
  const named = new Set((plannerEntries || []).map(e => e.profile_id))
  return new Set((profiles || []).filter(p => p.contract_type === 'five_eighths' && !named.has(p.id)).map(p => p.id))
}

// A shift nobody holds yet: one the scheduler flagged, or a locum
// placeholder with no name and no account behind it ("[ ]"). The second
// matters because a roster that didn't come from the scheduler carries no
// flags at all — its empty placeholders were being counted, and drawn, as
// if they were filled locum shifts.
export function isUnfilled(entry) {
  if (entry.is_flagged) return true
  if (!entry.is_locum || entry.profile_id) return false
  return !entry.locum_name || /^\[\s*\]$/.test(entry.locum_name.trim())
}

export const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// "Don't show again until this changes" for the weekend-planner drift
// warning — persisted in sessionStorage against a snapshot of the drift
// itself (not just a bare on/off flag), so muting self-invalidates the
// moment the planner changes again instead of needing to be re-armed.
export function driftStorageKey(rosterMonthId) {
  return `rotacat:weekendDriftMuted:${rosterMonthId}`
}
export function isDriftMuted(rosterMonthId, drift) {
  return drift.length > 0 && sessionStorage.getItem(driftStorageKey(rosterMonthId)) === JSON.stringify(drift)
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Shift display headers. The label is the shift's own name ("WD 08h-18h")
// rather than a bare start time — see src/lib/shiftLabels.js.
const WEEKDAY_SHIFTS = shiftColumns(['WD_08', 'WD_12', 'WD_15', 'WD_22'])
const WEEKEND_SHIFTS = shiftColumns(['WE_08', 'WE_13', 'WE_20'])
const PH_WEEKDAY_SHIFTS = shiftColumns(['PHW_08', 'PHW_12', 'PHW_15', 'PHW_22'])
const PH_WEEKEND_SHIFTS = shiftColumns(['PH_08', 'PH_13', 'PH_20'])

export function getShiftsForDay(dayType) {
  if (dayType === 'weekday') return WEEKDAY_SHIFTS
  if (dayType === 'weekend') return WEEKEND_SHIFTS
  if (dayType === 'PH_weekday') return PH_WEEKDAY_SHIFTS
  return PH_WEEKEND_SHIFTS
}
