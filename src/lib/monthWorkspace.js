// Pure helpers for the Annual Leave planner's month workspace
// (MonthWorkspace.jsx) — the detailed single-month calendar opened from
// the year overview, kept separate from the Supabase fetch so it's
// unit-testable without mocking the client. The approval-time capacity
// check that used to live here (checkApprovalCapacityImpact) is now the
// annual_leave_capacity RPC via getApprovalWarnings (leaveApprovals.js).
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_GROUP_KEYS, LEAVE_FULL_TIME_POOL_LABEL, LEAVE_CAPACITY_STATES, datesInMonth,
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

// True for any category with a real cap to compare against — the three
// LEAVE_FULL_TIME_GROUP_KEYS always do (their combined pool), OT COSMO/
// Intern does via its own maxByColumnKey entry; false for a column-less
// category (Other/Consultant) that daysWithRoomForCategory/
// categoryPressureState below shouldn't be computed for at all.
function hasCapacityColumn(columnKey, maxByColumnKey) {
  return LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey) || maxByColumnKey[columnKey] != null
}

// The one rule for "is there room for one more doctor in this column": a
// day has no room if EITHER the column's own cap OR, for MO/Registrar/
// EC_Intern, the shared full-time pool's cap (maxFullTime, default 2) is
// reached. Both limits apply at once — 1 MO + 1 Registrar leaves no room for
// a 3rd pooled doctor though neither column is at its own cap, and 2
// Registrars leave the Registrar column full though the pool's reading is
// the same number. Reports whichever limit has the LEAST room left (ties
// go to the pool, which is the reading the banners name); `pooled` says
// which one that was, so LeaveCapacityBanner can word it. OT Intern is a
// separate, independent pool with its own cap (1) — additive, never part
// of the shared pool, and never available to the other categories.
// Shared by every reading below, by fetchAnnualCapacityPreview's worst-day
// scan and by the day panel (via myCategoryDaySlots), so no two screens can
// disagree about whether a day has room.
export function tightestSlotsForColumn({ columnKey, columnTaken, columnMax, poolTaken, poolMax }) {
  const inPool = LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)
  const column = columnMax == null ? null : { taken: columnTaken, max: columnMax, pooled: false }
  const pool = inPool && poolMax != null ? { taken: poolTaken, max: poolMax, pooled: true } : null
  if (!column && !pool) return null
  if (!column) return pool
  if (!pool) return column
  return (column.max - column.taken) < (pool.max - pool.taken) ? column : pool
}

export function slotsForColumnOnDate(date, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap) {
  const counts = countByColumnPerDateMap.get(date)
  const poolTaken = LEAVE_FULL_TIME_GROUP_KEYS.reduce((sum, key) => sum + (counts?.get(key) || 0), 0)
  return tightestSlotsForColumn({
    columnKey,
    columnTaken: counts?.get(columnKey) || 0,
    columnMax: maxByColumnKey[columnKey],
    poolTaken,
    poolMax: maxFullTime,
  })
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

// Same rule as slotsForColumnOnDate, but for a single already-summarised
// day — MonthWorkspace's DayReviewModal already has a `capacity` prop
// (dayCapacitySummary's per-column {key,count,max} array for that one date)
// rather than a whole month's countByColumnPerDateMap, so the day view
// reads directly off that instead of re-deriving it.
export function myCategoryDaySlots(columnKey, capacity, maxFullTime) {
  const col = capacity.find(c => c.key === columnKey)
  const poolTaken = capacity
    .filter(c => LEAVE_FULL_TIME_GROUP_KEYS.includes(c.key))
    .reduce((sum, c) => sum + c.count, 0)
  return tightestSlotsForColumn({
    columnKey,
    columnTaken: col?.count || 0,
    columnMax: col?.max ?? null,
    poolTaken,
    poolMax: maxFullTime,
  })
}

// The generic (no own category — an admin, a Consultant) day banner's
// second line, pool by pool: the shared pool and each separate column,
// each named with its own room left. "N slots available across all
// categories" was wrong whenever the pools were unevenly full — a full
// shared pool with the OT Intern slot free read as one slot anyone could
// take, and the OT Intern slot is never available to the other categories.
// Returns null when nothing at all is free (the banner's own "Full" copy
// covers that).
export function genericDayAvailabilityLine(capacity, maxFullTime) {
  const poolTaken = capacity
    .filter(c => LEAVE_FULL_TIME_GROUP_KEYS.includes(c.key))
    .reduce((sum, c) => sum + c.count, 0)
  const poolFree = Math.max(0, maxFullTime - poolTaken)
  const separate = capacity
    .filter(c => !LEAVE_FULL_TIME_GROUP_KEYS.includes(c.key) && c.max != null)
    .map(c => ({ label: c.label, free: Math.max(0, c.max - c.count) }))
  if (poolFree === 0 && separate.every(c => c.free === 0)) return null
  const parts = [
    poolFree === 0
      ? `Shared pool full (${LEAVE_FULL_TIME_POOL_LABEL}).`
      : `${poolFree} of ${maxFullTime} shared pool slot${maxFullTime === 1 ? '' : 's'} free (${LEAVE_FULL_TIME_POOL_LABEL}).`,
    ...separate.map(c => c.free === 0 ? `${c.label} slot full.` : `${c.free} ${c.label} slot${c.free === 1 ? '' : 's'} free.`),
  ]
  return parts.join(' ')
}

// Personalised day-cell fill for the non-admin mobile month grid
// (MonthWorkspace's MobileDayCell) — collapses the generic 4-state total
// headcount read down to the states actually reachable within the
// viewer's own pool: full-time (MO/Registrar/EC COSMO) has 2 slots, so
// 0/1/2 taken maps to available/limited/at capacity (there's no 3rd
// distinct level to give a "near capacity" step to); OT COSMO/Intern has
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
// flat headcount, since MO/Registrar/EC COSMO share one pool and OT
// COSMO/Intern has its own.
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
