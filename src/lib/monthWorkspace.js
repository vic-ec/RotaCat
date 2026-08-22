// Pure helpers for the Annual Leave planner's month workspace
// (MonthWorkspace.jsx) — the detailed single-month calendar opened from
// the year overview, kept separate from the Supabase fetch so it's
// unit-testable without mocking the client.
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_GROUP_KEYS, LEAVE_CAPACITY_STATES,
  buildLeaveByDate, countByColumnPerDate, findLeaveCapacityBreach, findFullTimeAggregateBreach, datesInMonth,
} from './leaveYearGrid'
import { resolveLeaveCapacityColumn } from './internRotations'

// Every entry (approved or pending, already reshaped to { profileId,
// surname, category, status, dateFrom, ... }) touching one date, grouped by
// capacity column — the day panel's "who's on this day, by category" list.
// Resolved off each entry's OWN dateFrom (not `date`, the day being
// rendered) so a multi-day request straddling a rotation boundary still
// lands in one column consistently across every day it touches, matching
// resolveLeaveCapacityColumn's "resolve once per row" contract.
// rotationsByDoctorId defaults to an empty map for callers that haven't
// fetched it (e.g. tests) — resolveLeaveCapacityColumn degrades to static
// bucketing in that case, same as no rotation being on record.
export function dayEntriesByColumn(date, { approvedByDate, pendingByDate }, rotationsByDoctorId = new Map()) {
  const all = [...(approvedByDate.get(date) || []), ...(pendingByDate.get(date) || [])]
  const byColumn = new Map()
  for (const entry of all) {
    const key = resolveLeaveCapacityColumn({ category: entry.category, contractType: entry.contractType, profileId: entry.profileId, date: entry.dateFrom, rotationsByDoctorId })
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
// rotationsByDoctorId defaults to an empty map — resolveLeaveCapacityColumn
// degrades to static category bucketing when it's not passed (e.g. tests,
// or a category with no capacity column at all).
export function checkApprovalCapacityImpact(request, otherRows, maxByColumnKey, maxFullTime, rotationsByDoctorId = new Map()) {
  const columnKey = resolveLeaveCapacityColumn({
    category: request.profiles?.category, contractType: request.profiles?.contract_type, profileId: request.profile_id, date: request.date_from, rotationsByDoctorId,
  })
  const columnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnKey)
  if (!columnDef) return { applicable: false }

  const byDate = buildLeaveByDate(otherRows, {
    yearFrom: Number(request.date_from.slice(0, 4)), yearTo: Number(request.date_to.slice(0, 4)),
  })
  const countsByDate = countByColumnPerDate(byDate, e => resolveLeaveCapacityColumn({
    category: e.profiles?.category, contractType: e.profiles?.contract_type, profileId: e.profile_id, date: e.date_from, rotationsByDoctorId,
  }))

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

// True for any category with a real cap to compare against — the three
// LEAVE_FULL_TIME_GROUP_KEYS always do (their combined pool), OT
// Intern does via its own maxByColumnKey entry; false for a column-less
// category (Other/Consultant) that daysWithRoomForCategory/
// categoryPressureState below shouldn't be computed for at all.
function hasCapacityColumn(columnKey, maxByColumnKey) {
  return LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey) || maxByColumnKey[columnKey] != null
}

// MO/Registrar/EC_Intern draw from one shared pool (maxFullTime, default 2
// — see LEAVE_FULL_TIME_GROUP_KEYS/totalLeaveCeiling in leaveYearGrid.js):
// a day with 1 MO + 1 Registrar already has zero room left for a 3rd
// MO/Registrar/EC Intern doctor, even though neither individual column's own
// historical max (2/1/2) has been hit on its own. OT Intern is a
// separate, independent pool with its own cap (1) — additive, not part of
// this shared pool.
// Exported (not just used internally) so leaveRequests.js's
// fetchAnnualCapacityPreview can reuse the exact same combined-pool
// calculation for a not-yet-submitted request's date range, instead of
// reimplementing it against its own countByColumnPerDate map.
export function slotsForColumnOnDate(date, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap) {
  const counts = countByColumnPerDateMap.get(date)
  if (LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)) {
    const taken = LEAVE_FULL_TIME_GROUP_KEYS.reduce((sum, key) => sum + (counts?.get(key) || 0), 0)
    return { taken, max: maxFullTime }
  }
  return { taken: counts?.get(columnKey) || 0, max: maxByColumnKey[columnKey] }
}

// The day-view banner's own "how urgent is this" read — a 3-step scale
// (available/near capacity/at capacity) that skips the middle "limited"
// step myCategoryCapacityStateForDate's day-cell fill uses: a banner is
// answering "should I even try requesting this", not just "is there room
// at all" the way a day-cell's quick-glance fill is, so a single slot
// still open already reads as "getting tight" (orange) rather than
// "fine" (yellow). Shared by MonthWorkspace's DayReviewModal and
// LeaveRequestForm's capacity preview via LeaveCapacityBanner, so both
// always agree on which colour a given {taken, max} pair gets.
export function bannerStateForSlots({ taken, max }) {
  const available = max - taken
  if (available <= 0) return LEAVE_CAPACITY_STATES[3]
  if (available === max) return LEAVE_CAPACITY_STATES[0]
  return LEAVE_CAPACITY_STATES[2]
}

// Same combined-pool logic as slotsForColumnOnDate, but for a single
// already-summarised day — MonthWorkspace's DayReviewModal already has a
// `capacity` prop (dayCapacitySummary's per-column {key,count,max} array
// for that one date) rather than a whole month's countByColumnPerDateMap,
// so the day view reads directly off that instead of re-deriving it.
export function myCategoryDaySlots(columnKey, capacity, maxFullTime) {
  if (LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)) {
    const taken = capacity
      .filter(c => LEAVE_FULL_TIME_GROUP_KEYS.includes(c.key))
      .reduce((sum, c) => sum + c.count, 0)
    return { taken, max: maxFullTime }
  }
  const col = capacity.find(c => c.key === columnKey)
  if (!col || col.max == null) return null
  return { taken: col.count, max: col.max }
}

// Personalised day-cell fill for the non-admin mobile month grid
// (MonthWorkspace's MobileDayCell) — collapses the generic 4-state total
// headcount read down to the states actually reachable within the
// viewer's own pool: full-time (MO/Registrar/EC Intern) has 2 slots, so
// 0/1/2 taken maps to available/limited/at capacity (there's no 3rd
// distinct level to give a "near capacity" step to); OT Intern has
// only 1 slot, so 0/1 taken jumps straight from available to at capacity
// with no middle state at all. Admins keep the generic total-based read on
// every day cell regardless of viewport (their job is cross-category
// exception spotting, not personal capacity planning) — this is only ever
// called for a non-admin viewer with a resolvable capacity column.
export function myCategoryCapacityStateForDate(date, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap) {
  const { taken, max } = slotsForColumnOnDate(date, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap)
  if (taken <= 0) return LEAVE_CAPACITY_STATES[0]
  if (taken >= max) return LEAVE_CAPACITY_STATES[3]
  return LEAVE_CAPACITY_STATES[1]
}

// Which LEAVE_CAPACITY_STATES are actually reachable for one viewer's own
// pool — the legend counterpart to myCategoryCapacityStateForDate above, so
// a non-admin's mobile legend only lists the 2 or 3 states their own day
// cells can actually show rather than the admin's full 4-state scale.
export function myCategoryLegendStates(columnKey) {
  return LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)
    ? [LEAVE_CAPACITY_STATES[0], LEAVE_CAPACITY_STATES[1], LEAVE_CAPACITY_STATES[3]]
    : [LEAVE_CAPACITY_STATES[0], LEAVE_CAPACITY_STATES[3]]
}

// How many days in [year, month] still have room for one more doctor in
// `columnKey` — the Annual planner's mobile "Your leave" card personalises
// its headline stat to the viewer's own category with this ("N of 31 days
// have room for your category") rather than a flat admin-style count.
// Returns null for a category with no capacity column (Other) so the
// caller knows not to render the card at all.
export function daysWithRoomForCategory(year, month, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap) {
  if (!hasCapacityColumn(columnKey, maxByColumnKey)) return null
  const dates = datesInMonth(year, month)
  const withRoom = dates.filter(d => {
    const slots = slotsForColumnOnDate(d, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap)
    return slots.taken < slots.max
  }).length
  return { withRoom, total: dates.length }
}

// A quick qualitative read on how pressured one capacity column is over a
// month, expressed with the same Available/Limited/Near capacity/At
// capacity vocabulary the day/month fill colours already use — used for the
// "Your leave" card's quiet pills for *other* categories (and its own
// headline number), so a viewer gets a useful signal without the raw x/y
// quota this round's redesign otherwise removes from the day view. Based on
// the share of the month's days that are already at that pool's cap, not a
// flat headcount, since MO/Registrar/EC Intern share one pool and OT
// Intern has its own.
export function categoryPressureState(year, month, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap) {
  if (!hasCapacityColumn(columnKey, maxByColumnKey)) return null
  const dates = datesInMonth(year, month)
  const fullDays = dates.filter(d => {
    const slots = slotsForColumnOnDate(d, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap)
    return slots.taken >= slots.max
  }).length
  const ratio = fullDays / dates.length
  if (ratio === 0) return LEAVE_CAPACITY_STATES[0]
  if (ratio < 1 / 3) return LEAVE_CAPACITY_STATES[1]
  if (ratio < 1) return LEAVE_CAPACITY_STATES[2]
  return LEAVE_CAPACITY_STATES[3]
}
