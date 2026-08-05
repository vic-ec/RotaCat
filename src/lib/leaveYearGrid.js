// Pure logic for the Annual Leave / Special Leave planner grids — a year
// laid out as 4 quarters of 3 months each, mirroring the team's existing
// Google Sheet. Kept separate from the display components so the date math
// and capacity rule are unit-testable without Supabase or React.
import { datesInRange, monthBounds, dayOfWeek } from './dateRange'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Capacity-capped columns for the Annual Leave planner. MO, Registrar, and
// EC Intern are the "full-time EC doctor" columns for the purposes of
// the combined cap below: each has its own per-column cap AND, combined
// across those three, may never exceed LEAVE_FULL_TIME_DEFAULT_MAX at once
// (see findFullTimeAggregateBreach below). OT Intern is a separate
// pool with its own independent cap, additive on top of that combined cap
// rather than part of it. Consultant/Locum never appear (not part of the
// leave-eligible doctor roster); Consultant alone falls into an uncapped
// "Other" column so their leave isn't hidden off the grid.
export const LEAVE_CAPACITY_COLUMNS = [
  { key: 'MO', label: 'MO', categories: ['MO'], constraintKey: 'leave_max_concurrent_mo', defaultMax: 2 },
  { key: 'Registrar', label: 'Registrar', categories: ['Registrar'], constraintKey: 'leave_max_concurrent_registrar', defaultMax: 1 },
  { key: 'EC_COSMO', label: 'EC Intern', categories: ['COSMO', 'EC_COSMO', 'EC_COSMO_Intern', 'Intern'], constraintKey: 'leave_max_concurrent_ec_cosmo', defaultMax: 2 },
  { key: 'OT_COSMO', label: 'OT Intern', categories: ['COSMOPsych', 'OT_COSMO', 'OT_COSMO_Intern'], constraintKey: 'leave_max_concurrent_ot_cosmo', defaultMax: 1 },
]

export const LEAVE_OTHER_COLUMN = { key: 'Other', label: 'Consultant', categories: ['Consultant'] }

// Only COSMO and Intern are actually ambiguous without contractType —
// every other legacy value (COSMOPsych, EC_COSMO, OT_COSMO,
// EC_COSMO_Intern, OT_COSMO_Intern) already unambiguously says EC or OT
// via its own name/history, so it resolves through the static
// COLUMN_BY_CATEGORY map unchanged, same as before 2026-08.
const AMBIGUOUS_CATEGORIES = new Set(['COSMO', 'Intern'])
const OT_HOURS_CONTRACT_TYPES = new Set(['Junior_Doctor_Overtime'])

const COLUMN_BY_CATEGORY = new Map(
  [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN].flatMap(col => col.categories.map(c => [c, col.key]))
)

// Returns the planner column key for a staff_category, or null if it
// shouldn't appear on the grid at all (Locum, or an unrecognised value).
// `contractType` is required for COSMO/Intern specifically — see
// AMBIGUOUS_CATEGORIES above — since category alone no longer determines
// EC vs OT for those two. Every other category (including the legacy OT/
// EC-specific values) ignores contractType entirely.
export function columnForLeaveCategory(category, contractType) {
  if (AMBIGUOUS_CATEGORIES.has(category)) {
    return OT_HOURS_CONTRACT_TYPES.has(contractType) ? 'OT_COSMO' : 'EC_COSMO'
  }
  return COLUMN_BY_CATEGORY.get(category) ?? null
}

// Shared column->badge-letter mapping for every calendar view that renders
// these categories (LeaveYearGrid.jsx's mobile month-glance, and
// MonthWorkspace.jsx's desktop+mobile calendars) — kept here, not in either
// component, so both agree on which letters mean which category. Rendered
// via CategoryBadge.jsx, a single-colour badge — unlike the old
// COLUMN_DOT_COLOR this replaced, colour no longer varies by category, so
// it can't be mistaken for the capacity heat-map colours used elsewhere on
// the same grids.
export const COLUMN_BADGE_LABEL = {
  MO: 'MO',
  Registrar: 'Reg',
  EC_COSMO: 'EC',
  OT_COSMO: 'OT',
  Other: 'C',
}

// Full-length category name for a capacity column, for a headline that
// reads too abbreviated at just the column's own `label` (the Annual
// planner's mobile "Your leave" card header) — every column now already
// matches its own `label` exactly (see LEAVE_CAPACITY_COLUMNS above), so
// this only needs to spell out MO.
export const COLUMN_FULL_LABEL = {
  MO: 'Medical Officer',
  Registrar: 'Registrar',
  EC_COSMO: 'EC Intern',
  OT_COSMO: 'OT Intern',
}

// Four-state "how full is this day" read for the mobile planner's day/month
// fill colouring — a visual indicator of the *observed* total headcount on
// leave (all 4 capacity columns combined, pending+approved combined).
// Clamped at 3 — the full-time combined cap (2) plus OT COSMO/Intern's own
// separate cap (1), see totalLeaveCeiling below — so 3 really is the
// ceiling every doctor can hit in practice with the default caps, not just
// a display simplification. Uses the dedicated
// cap* palette (tailwind.config.js), not flagAmber/flagRed, so this scale's
// contrast can be tuned independently of shared status colours elsewhere.
//   fill        solid state colour — legend swatches and year-grid day
//               blocks (so the legend visibly matches what it's a legend
//               for).
//   light       `fill` lightened ~7.5% toward white — used by the month
//               workspace's day blocks/legend and the day-view "N of 3
//               slots taken" pill, which read as too saturated at full
//               `fill` strength.
//   tint        a paler alternative background, kept for any caller that
//               wants a softer fill than `fill`.
//   dark/ringDark  a deeper shade of the same hue for the public-holiday
//               accent — `dark` as a fill, `ringDark` as a border/ring, so
//               a PH day still reads its own capacity colour underneath.
//   text        on-white text colour for the state's own numbers (e.g. the
//               Leave Slot Utilization day-counts) — a shade lighter than
//               `dark` so available/limited/near/at-capacity still read as
//               four different hues instead of converging on the same
//               near-black brown once darkened enough for contrast.
//   onFillText/onFillMuted  primary/secondary text colour for content
//               sitting on top of the solid `fill`/`light` background (day
//               numbers, entries) — dark ink on the light `limited`
//               (yellow) state, white on the three darker states.
export const LEAVE_CAPACITY_STATES = [
  {
    key: 'available', label: 'Available',
    fill: 'bg-capAvailable', light: 'bg-capAvailable-light', tint: 'bg-capAvailable-tint', dark: 'bg-capAvailable-dark', ringDark: 'ring-capAvailable-dark',
    text: 'text-capAvailable-ink', onFillText: 'text-white', onFillMuted: 'text-white/75',
  },
  {
    key: 'limited', label: 'Limited',
    fill: 'bg-capLimited', light: 'bg-capLimited-light', tint: 'bg-capLimited-tint', dark: 'bg-capLimited-dark', ringDark: 'ring-capLimited-dark',
    text: 'text-capLimited-ink', onFillText: 'text-ink', onFillMuted: 'text-ink-light',
  },
  {
    key: 'near_capacity', label: 'Near capacity',
    fill: 'bg-capNear', light: 'bg-capNear-light', tint: 'bg-capNear-tint', dark: 'bg-capNear-dark', ringDark: 'ring-capNear-dark',
    text: 'text-capNear-ink', onFillText: 'text-white', onFillMuted: 'text-white/75',
  },
  {
    key: 'at_capacity', label: 'At capacity',
    fill: 'bg-capAtCapacity', light: 'bg-capAtCapacity-light', tint: 'bg-capAtCapacity-tint', dark: 'bg-capAtCapacity-dark', ringDark: 'ring-capAtCapacity-dark',
    text: 'text-capAtCapacity-ink', onFillText: 'text-white', onFillMuted: 'text-white/75',
  },
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

// The "no more than 2 full-time EC doctors on leave at once" rule spans MO,
// Registrar, and EC COSMO/Intern combined — e.g. 2 MO, 1 MO + 1 Registrar,
// 1 MO + 1 EC COSMO/Intern, 1 Registrar + 1 EC COSMO/Intern, or 2 EC
// COSMO/Intern — never 2 Registrar (already capped at 1 above). OT
// COSMO/Intern is a separate stream with its own cap (1) and isn't part of
// this aggregate — it's additive on top, giving an overall ceiling of 3
// doctors (any category) on leave at once (see totalLeaveCeiling below).
export const LEAVE_FULL_TIME_GROUP_KEYS = ['MO', 'Registrar', 'EC_COSMO']
export const LEAVE_FULL_TIME_CONSTRAINT_KEY = 'leave_max_concurrent_fulltime'
export const LEAVE_FULL_TIME_DEFAULT_MAX = 2

// Splits a list of column keys into "shown" (max 4) and an overflow count
// for a 5th+ — shared by every day-glance-style cluster (LeaveYearGrid's
// MonthGlance, MonthWorkspace's MobileDayCell) so they all agree on when to
// switch from "every badge" to "3 badges + a +N chip".
export function splitForOverflow(keys, max = 4) {
  if (keys.length <= max) return { shown: keys, overflow: 0 }
  return { shown: keys.slice(0, max - 1), overflow: keys.length - (max - 1) }
}

const LABEL_BY_CATEGORY = new Map(
  [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN].flatMap(col => col.categories.map(c => [c, col.label]))
)

// The friendly column label for a raw staff_category — falls back to the
// raw category for anything not on the grid (Locum, unrecognised values)
// rather than hiding it entirely. Same contractType requirement as
// columnForLeaveCategory above, for the same reason (COSMO/Intern alone no
// longer says EC vs OT).
export function labelForLeaveCategory(category, contractType) {
  const columnKey = columnForLeaveCategory(category, contractType)
  if (columnKey) {
    const col = [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN].find(c => c.key === columnKey)
    if (col) return col.label
  }
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
// to check the capacity rule at submission time. `columnKeyOf(entry)`
// resolves the already-final column key for one entry (profile_id +
// date_from/category are typically what it needs) — callers that don't
// need rotation-awareness pass `e => columnForLeaveCategory(e.category)`
// directly; callers bucketing an Intern-eligible doctor pass
// resolveLeaveCapacityColumn (see internRotations.js) instead so a bare
// 'Intern' category resolves through that doctor's own rotation blocks
// rather than the static category->column table alone.
export function countByColumnPerDate(leaveByDate, columnKeyOf) {
  const counts = new Map()
  for (const [date, entries] of leaveByDate) {
    const perColumn = new Map()
    const seenProfiles = new Set() // a doctor can only occupy one column once per day even with overlapping rows
    for (const entry of entries) {
      if (seenProfiles.has(entry.profile_id)) continue
      const column = columnKeyOf(entry)
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
// to (not instead of) each column's own findLeaveCapacityBreach — e.g. 1 MO
// + 1 Registrar already satisfies each individual cap but would still
// breach a maxTotal of 2 if a 3rd of any of those columns were added.
export function findFullTimeAggregateBreach({ dateFrom, dateTo, maxTotal, existingCountsByDate }) {
  const breachDates = []
  for (const date of datesInRange(dateFrom, dateTo)) {
    const perColumn = existingCountsByDate.get(date)
    const total = LEAVE_FULL_TIME_GROUP_KEYS.reduce((sum, key) => sum + (perColumn?.get(key) || 0), 0)
    if (total + 1 > maxTotal) breachDates.push(date)
  }
  return { hasBreach: breachDates.length > 0, breachDates }
}

// The overall "how many doctors, any category, could be on leave the same
// day" ceiling — the full-time combined cap plus every capacity column's
// own max that sits outside that group (today just OT COSMO/Intern, a
// separate additive pool). Used wherever the UI needs a single "N of
// TOTAL" figure rather than just the full-time-only cap.
export function totalLeaveCeiling(maxFullTime, maxByColumnKey) {
  const additional = LEAVE_CAPACITY_COLUMNS
    .filter(col => !LEAVE_FULL_TIME_GROUP_KEYS.includes(col.key))
    .reduce((sum, col) => sum + (maxByColumnKey[col.key] ?? col.defaultMax), 0)
  return maxFullTime + additional
}
