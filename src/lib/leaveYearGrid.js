// Pure logic for the Annual Leave / Special Leave planner grids — a year
// laid out as 4 quarters of 3 months each, mirroring the team's existing
// Google Sheet. Kept separate from the display components so the date math
// and capacity rule are unit-testable without Supabase or React.
import { datesInRange, monthBounds, dayOfWeek } from './dateRange'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Capacity-capped columns for the Annual Leave planner — all four are
// "full-time EC doctor" columns for the purposes of the combined cap below
// (per the EC Leave Planner Google Sheet): each has its own per-column cap
// AND, combined across all four, may never exceed LEAVE_FULL_TIME_MAX at
// once (see findFullTimeAggregateBreach below). Consultant/Locum never
// appear (not part of the leave-eligible doctor roster); Consultant alone
// falls into an uncapped "Other" column so their leave isn't hidden off the
// grid.
export const LEAVE_CAPACITY_COLUMNS = [
  { key: 'MO', label: 'MO', categories: ['MO'], constraintKey: 'leave_max_concurrent_mo', defaultMax: 2 },
  { key: 'Registrar', label: 'Registrar', categories: ['Registrar'], constraintKey: 'leave_max_concurrent_registrar', defaultMax: 1 },
  { key: 'EC_COSMO', label: 'EC COSMO / Intern', categories: ['COSMO', 'EC_COSMO', 'EC_COSMO_Intern', 'Intern'], constraintKey: 'leave_max_concurrent_ec_cosmo', defaultMax: 2 },
  { key: 'OT_COSMO', label: 'OT COSMO / Intern', categories: ['COSMOPsych', 'OT_COSMO', 'OT_COSMO_Intern'], constraintKey: 'leave_max_concurrent_ot_cosmo', defaultMax: 1 },
]

export const LEAVE_OTHER_COLUMN = { key: 'Other', label: 'Consultant', categories: ['Consultant'] }

// Shared column->colour mapping for both calendar views that render these
// categories (LeaveYearGrid.jsx's mobile month-glance, and MonthWorkspace.jsx's
// desktop calendar) — kept here, not in either component, so both agree on
// which colour means which category.
export const COLUMN_DOT_COLOR = {
  MO: 'bg-accent',
  Registrar: 'bg-rose',
  EC_COSMO: 'bg-amber-500',
  OT_COSMO: 'bg-blue-500',
  Other: 'bg-ink-muted',
}

// Four-state "how full is this day" read for the mobile planner's day/month
// fill colouring — a visual indicator of the *observed* total headcount on
// leave (all 4 capacity columns combined, pending+approved combined).
// Clamped at 3, matching LEAVE_FULL_TIME_DEFAULT_MAX below — the combined
// cap across all four columns, so 3 really is the ceiling every doctor can
// hit in practice, not just a display simplification. Uses the dedicated
// cap* palette (tailwind.config.js), not flagAmber/flagRed, so this scale's
// contrast can be tuned independently of shared status colours elsewhere.
// `dark` is the public-holiday treatment — a deeper shade of the same
// state, layered on top of `fill`/`tint` instead of a border/ring (which
// doesn't read well against a solid or tinted background).
export const LEAVE_CAPACITY_STATES = [
  { key: 'available', label: 'Available', fill: 'bg-capAvailable', tint: 'bg-capAvailable-tint', dark: 'bg-capAvailable-dark', text: 'text-capAvailable-dark' },
  { key: 'limited', label: 'Limited', fill: 'bg-capLimited', tint: 'bg-capLimited-tint', dark: 'bg-capLimited-dark', text: 'text-capLimited-dark' },
  { key: 'near_capacity', label: 'Near capacity', fill: 'bg-capNear', tint: 'bg-capNear-tint', dark: 'bg-capNear-dark', text: 'text-capNear-dark' },
  { key: 'at_capacity', label: 'At capacity', fill: 'bg-capAtCapacity', tint: 'bg-capAtCapacity-tint', dark: 'bg-capAtCapacity-dark', text: 'text-capAtCapacity-dark' },
]

// Sum of every capacity column's count for one date — the total distinct
// doctors (any category) on annual leave that day, pending+approved
// combined. Not the same thing as any single column's own cap.
export function totalLeaveSlotsForDate(date, countByColumnPerDate) {
  const perColumn = countByColumnPerDate.get(date)
  if (!perColumn) return 0
  return LEAVE_CAPACITY_COLUMNS.reduce((sum, col) => sum + (perColumn.get(col.key) || 0), 0)
}

// Maps a total headcount to one of the 4 LEAVE_CAPACITY_STATES, clamping
// anything at or above 3 to "at capacity".
export function capacityStateForCount(count) {
  return LEAVE_CAPACITY_STATES[Math.min(count, 3)]
}

// The "no more than 3 full-time EC doctors on leave at once" rule spans all
// four capacity columns combined — e.g. 2 MO + 1 Registrar, 2 MO + 1 EC
// COSMO/Intern, 2 MO + 1 OT COSMO/Intern, 2 EC COSMO/Intern + 1 Registrar,
// 2 EC COSMO/Intern + 1 OT COSMO/Intern, or 1 MO + 1 Registrar + 1 (EC or OT)
// COSMO/Intern — never 2 Registrar or 2 OT COSMO/Intern (each already capped
// at 1 above). Per the EC Leave Planner Google Sheet: MO and EC COSMO/Intern
// may each contribute up to 2 of the 3 combined slots, Registrar and OT
// COSMO/Intern up to 1 each.
export const LEAVE_FULL_TIME_GROUP_KEYS = ['MO', 'Registrar', 'EC_COSMO', 'OT_COSMO']
export const LEAVE_FULL_TIME_CONSTRAINT_KEY = 'leave_max_concurrent_fulltime'
export const LEAVE_FULL_TIME_DEFAULT_MAX = 3

const COLUMN_BY_CATEGORY = new Map(
  [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN].flatMap(col => col.categories.map(c => [c, col.key]))
)

// Returns the planner column key for a staff_category, or null if it
// shouldn't appear on the grid at all (Locum, or an unrecognised value).
export function columnForLeaveCategory(category) {
  return COLUMN_BY_CATEGORY.get(category) ?? null
}

const LABEL_BY_CATEGORY = new Map(
  [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN].flatMap(col => col.categories.map(c => [c, col.label]))
)

// The friendly column label for a raw staff_category (e.g. 'EC_COSMO_Intern'
// -> 'EC COSMO / Intern') — falls back to the raw category for anything not
// on the grid (Locum, unrecognised values) rather than hiding it entirely.
export function labelForLeaveCategory(category) {
  return LABEL_BY_CATEGORY.get(category) ?? category
}

// 12 {year, month, label} entries for a calendar year.
export function monthsForYear(year) {
  return MONTH_LABELS.map((label, i) => ({ year, month: i + 1, label }))
}

// Chunks monthsForYear into 4 quarters of 3 months each.
export function quartersForYear(year) {
  const months = monthsForYear(year)
  const quarters = []
  for (let i = 0; i < 12; i += 3) {
    quarters.push({ index: i / 3 + 1, months: months.slice(i, i + 3) })
  }
  return quarters
}

// Every "YYYY-MM-DD" date in a given month, in order.
export function datesInMonth(year, month) {
  const { start, end } = monthBounds(year, month)
  return datesInRange(start, end)
}

// Sunday-start weeks covering a month, padded with null on either end so
// every week is exactly 7 cells — for the mobile month-glance calendar
// grid (a standard Sun-Sat layout, unlike the day-row table the desktop
// quarters view uses).
export function weeksForMonth(year, month) {
  const dates = datesInMonth(year, month)
  const leadingBlanks = dayOfWeek(dates[0])
  const trailingBlanks = 6 - dayOfWeek(dates[dates.length - 1])
  const cells = [
    ...Array(leadingBlanks).fill(null),
    ...dates,
    ...Array(trailingBlanks).fill(null),
  ]
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// Flattens leave_requests rows (each spanning date_from..date_to) into one
// entry per calendar day within [yearFrom, yearTo], keyed by date. Each
// profile only needs name/surname/category on the request row (callers
// join that in via the leave_requests query).
export function buildLeaveByDate(leaveRequests, { yearFrom, yearTo }) {
  const byDate = new Map()
  const lowerBound = `${yearFrom}-01-01`
  const upperBound = `${yearTo}-12-31`
  for (const lr of leaveRequests) {
    const from = lr.date_from < lowerBound ? lowerBound : lr.date_from
    const to = lr.date_to > upperBound ? upperBound : lr.date_to
    if (from > to) continue
    for (const date of datesInRange(from, to)) {
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date).push(lr)
    }
  }
  return byDate
}

// Map<date, Map<columnKey, count>> — how many distinct profiles occupy each
// capacity column on each date. Used both to render "x/max" on the grid and
// to check the capacity rule at submission time.
export function countByColumnPerDate(leaveByDate, categoryOfProfile) {
  const counts = new Map()
  for (const [date, entries] of leaveByDate) {
    const perColumn = new Map()
    const seenProfiles = new Set() // a doctor can only occupy one column once per day even with overlapping rows
    for (const entry of entries) {
      if (seenProfiles.has(entry.profile_id)) continue
      const column = columnForLeaveCategory(categoryOfProfile(entry))
      if (!column) continue
      seenProfiles.add(entry.profile_id)
      perColumn.set(column, (perColumn.get(column) || 0) + 1)
    }
    counts.set(date, perColumn)
  }
  return counts
}

// Would adding one more doctor to `columnKey` on any date in [dateFrom,
// dateTo] push that day's count over `maxConcurrent`? existingCountsByDate
// is countByColumnPerDate's output over the *other* leave already on record
// (the request being validated must not itself be included in it).
export function findLeaveCapacityBreach({ dateFrom, dateTo, columnKey, maxConcurrent, existingCountsByDate }) {
  const breachDates = []
  for (const date of datesInRange(dateFrom, dateTo)) {
    const current = existingCountsByDate.get(date)?.get(columnKey) || 0
    if (current + 1 > maxConcurrent) breachDates.push(date)
  }
  return { hasBreach: breachDates.length > 0, breachDates }
}

// Would adding one more doctor (from any of LEAVE_FULL_TIME_GROUP_KEYS) push
// a day's combined full-time-doctor count over maxTotal? Checked in addition
// to (not instead of) each column's own findLeaveCapacityBreach — e.g. 2 MO
// + 1 Registrar already satisfies each individual cap but would still
// breach a maxTotal of 3 if a 3rd of any of those columns were added.
export function findFullTimeAggregateBreach({ dateFrom, dateTo, maxTotal, existingCountsByDate }) {
  const breachDates = []
  for (const date of datesInRange(dateFrom, dateTo)) {
    const perColumn = existingCountsByDate.get(date)
    const total = LEAVE_FULL_TIME_GROUP_KEYS.reduce((sum, key) => sum + (perColumn?.get(key) || 0), 0)
    if (total + 1 > maxTotal) breachDates.push(date)
  }
  return { hasBreach: breachDates.length > 0, breachDates }
}
