// Pure logic for the Annual Leave / Special Leave planner grids — a year
// laid out as 4 quarters of 3 months each, mirroring the team's existing
// Google Sheet. Kept separate from the display components so the date math
// and capacity rule are unit-testable without Supabase or React.
import { datesInRange, monthBounds } from './dateRange'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Capacity-capped columns for the Annual Leave planner. Registrar and MO
// stay separate (matching how the physical sheet splits them), OT COSMO and
// its Intern variant share one column and one cap — the finer
// staff_category values collapse down the same way WeekendPlanner's
// CATEGORY_GROUPS do. Consultant/Locum never appear (not part of the
// leave-eligible doctor roster); everything else eligible for leave but not
// one of these three groups (COSMO, EC_COSMO, EC_COSMO_Intern, Intern,
// Consultant) falls into a 4th, uncapped "Other" column so nobody's leave
// silently disappears off the grid.
export const LEAVE_CAPACITY_COLUMNS = [
  { key: 'MO', label: 'MO', categories: ['MO'], constraintKey: 'leave_max_concurrent_mo', defaultMax: 2 },
  { key: 'Registrar', label: 'Registrar', categories: ['Registrar'], constraintKey: 'leave_max_concurrent_registrar', defaultMax: 2 },
  { key: 'OT_COSMO', label: 'OT COSMO / Intern', categories: ['COSMOPsych', 'OT_COSMO', 'OT_COSMO_Intern'], constraintKey: 'leave_max_concurrent_ot_cosmo', defaultMax: 1 },
]

export const LEAVE_OTHER_COLUMN = { key: 'Other', label: 'Other', categories: ['COSMO', 'EC_COSMO', 'EC_COSMO_Intern', 'Intern', 'Consultant'] }

const COLUMN_BY_CATEGORY = new Map(
  [...LEAVE_CAPACITY_COLUMNS, LEAVE_OTHER_COLUMN].flatMap(col => col.categories.map(c => [c, col.key]))
)

// Returns the planner column key for a staff_category, or null if it
// shouldn't appear on the grid at all (Locum, or an unrecognised value).
export function columnForLeaveCategory(category) {
  return COLUMN_BY_CATEGORY.get(category) ?? null
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
