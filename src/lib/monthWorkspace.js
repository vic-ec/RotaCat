// Pure helpers for the Annual Leave planner's month workspace
// (MonthWorkspace.jsx) — the detailed single-month calendar opened from
// the year overview, kept separate from the Supabase fetch so it's
// unit-testable without mocking the client.
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_GROUP_KEYS, columnForLeaveCategory,
  buildLeaveByDate, countByColumnPerDate, findLeaveCapacityBreach, findFullTimeAggregateBreach,
} from './leaveYearGrid'

// Every entry (approved or pending, already reshaped to { profileId,
// surname, category, status, ... }) touching one date, grouped by capacity
// column — the day panel's "who's on this day, by category" list.
export function dayEntriesByColumn(date, { approvedByDate, pendingByDate }) {
  const all = [...(approvedByDate.get(date) || []), ...(pendingByDate.get(date) || [])]
  const byColumn = new Map()
  for (const entry of all) {
    const key = columnForLeaveCategory(entry.category)
    if (!key) continue
    if (!byColumn.has(key)) byColumn.set(key, [])
    byColumn.get(key).push(entry)
  }
  return byColumn
}

// Per-column capacity for one date: how many (pending+approved combined —
// see pressureDatesInYear in annualPlannerOverview.js for why) vs. the cap,
// and whether that column is already at or over it.
export function dayCapacitySummary(date, countByColumnPerDateMap, maxByColumnKey) {
  const counts = countByColumnPerDateMap.get(date)
  return LEAVE_CAPACITY_COLUMNS.map(col => {
    const count = counts?.get(col.key) || 0
    const max = maxByColumnKey[col.key]
    return { key: col.key, label: col.label, count, max, atCap: max != null && count >= max }
  })
}

// Would approving `request` breach the concurrency cap on any date in its
// range? Mirrors checkAnnualLeaveCapacity in leaveRequests.js exactly (same
// two checks: the request's own column, then the full-time aggregate if
// its column is part of that group) so this gives the same answer
// submission-time validation would — expected to rarely trigger, since a
// request that would breach shouldn't have been submittable in the first
// place, unless a cap was tightened after the fact. `otherRows` must
// exclude `request` itself (raw leave_requests rows with a `profiles`
// join, both pending and approved, for the same leave_type/year).
export function checkApprovalCapacityImpact(request, otherRows, maxByColumnKey, maxFullTime) {
  const columnKey = columnForLeaveCategory(request.profiles?.category)
  const columnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnKey)
  if (!columnDef) return { applicable: false }

  const byDate = buildLeaveByDate(otherRows, {
    yearFrom: Number(request.date_from.slice(0, 4)), yearTo: Number(request.date_to.slice(0, 4)),
  })
  const countsByDate = countByColumnPerDate(byDate, e => e.profiles?.category)

  const maxConcurrent = maxByColumnKey[columnKey]
  const column = findLeaveCapacityBreach({
    dateFrom: request.date_from, dateTo: request.date_to, columnKey, maxConcurrent, existingCountsByDate: countsByDate,
  })

  let fullTime = { hasBreach: false, breachDates: [] }
  if (LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)) {
    fullTime = findFullTimeAggregateBreach({
      dateFrom: request.date_from, dateTo: request.date_to, maxTotal: maxFullTime, existingCountsByDate: countsByDate,
    })
  }

  return {
    applicable: true,
    columnLabel: columnDef.label,
    columnBreach: column.hasBreach,
    columnBreachDates: column.breachDates,
    fullTimeBreach: fullTime.hasBreach,
    fullTimeBreachDates: fullTime.breachDates,
  }
}
