// Pure helpers for the Annual Leave planner's year-overview page
// (AnnualPlannerOverview.jsx) — a 12-month "decision" summary that now
// fronts the existing day-row spreadsheet (kept as the "month workspace"
// for detailed review/editing), kept separate from the Supabase fetch so
// it's unit-testable without mocking the client.
import { datesInRange, monthBounds } from './dateRange'
import { LEAVE_CAPACITY_COLUMNS, LEAVE_CAPACITY_STATES, totalLeaveSlotsForDate, capacityStateForCount } from './leaveYearGrid'

// Every date across a capacity-column count map (countByColumnPerDate's
// output, over pending+approved leave combined — that's what the
// concurrency cap actually counts, per checkAnnualLeaveCapacity in
// leaveRequests.js) where at least one column has hit (or passed) its max,
// i.e. no more of that category could be submitted for that day without
// being blocked.
export function pressureDatesInYear(countByColumnPerDate, maxByColumnKey) {
  const pressureDates = new Set()
  for (const [date, perColumn] of countByColumnPerDate) {
    for (const col of LEAVE_CAPACITY_COLUMNS) {
      const max = maxByColumnKey[col.key]
      if (max != null && (perColumn.get(col.key) || 0) >= max) {
        pressureDates.add(date)
        break
      }
    }
  }
  return pressureDates
}

// Per-day markers for one month's compact overview grid: whether that day
// has any approved leave, any pending request, and/or is a capacity-
// pressure day, plus whether it's a public holiday (and its name, for a
// hover tooltip). approvedByDate/pendingByDate are the reshaped
// { profileId, surname, ... } maps LeaveYearGrid's callers already build.
// publicHolidaysByDate is optional (defaults to none) since not every
// caller of this needs PH markers. totalSlots/capacityState (the "how full
// is this day" fill, see leaveYearGrid.js) are always computed from the
// unfiltered countByColumnPerDate — the day-block colour reflects reality
// regardless of which "All/My leave/Pending/Capacity issues" chip is active.
export function monthDayMarkers(year, month, { approvedByDate, pendingByDate, pressureDates, publicHolidaysByDate = new Map(), countByColumnPerDate = new Map() }) {
  const { start, end } = monthBounds(year, month)
  return datesInRange(start, end).map(date => {
    const totalSlots = totalLeaveSlotsForDate(date, countByColumnPerDate)
    return {
      date,
      hasApproved: (approvedByDate.get(date) || []).length > 0,
      hasPending: (pendingByDate.get(date) || []).length > 0,
      isPressure: pressureDates.has(date),
      isPublicHoliday: publicHolidaysByDate.has(date),
      publicHolidayName: publicHolidaysByDate.get(date) || null,
      totalSlots,
      capacityState: capacityStateForCount(totalSlots),
    }
  })
}

// One line of copy for a month card: "2 pressure days · 1 pending", "1
// pending", "2 pressure days", or "Quiet" when there's nothing to flag —
// kept as a single formatter so every card phrases this identically.
export function monthSummaryLine({ pressureDayCount, pendingCount }) {
  const parts = []
  if (pressureDayCount > 0) parts.push(`${pressureDayCount} pressure ${pressureDayCount === 1 ? 'day' : 'days'}`)
  if (pendingCount > 0) parts.push(`${pendingCount} pending`)
  return parts.length ? parts.join(' · ') : 'Quiet'
}

// The first contiguous run of pressure dates within a month (datesInRange
// is already chronological), for the inspector's "selected date range"
// detail — the most immediately actionable window, since that's where an
// admin can least afford to approve one more request. Null if the month
// has no pressure days.
export function firstPressureRangeInMonth(year, month, pressureDates) {
  const { start, end } = monthBounds(year, month)
  let rangeStart = null
  let rangeEnd = null
  for (const date of datesInRange(start, end)) {
    if (pressureDates.has(date)) {
      if (!rangeStart) rangeStart = date
      rangeEnd = date
    } else if (rangeStart) {
      break
    }
  }
  return rangeStart ? { from: rangeStart, to: rangeEnd } : null
}

// How many days in a month sit at each combined-headcount level (1 of 3, 2
// of 3, 3 of 3 doctors — any category — on leave, pending+approved
// combined) — powers the inspector's combined capacity summary. A
// read-only observed count, not a restatement of the submission-time cap
// (see LEAVE_CAPACITY_STATES in leaveYearGrid.js for why 3 is the ceiling
// here even though today's actual rule can allow a 4th in some cases).
// Days with nobody on leave (0 of 3) aren't part of this breakdown.
export function monthTotalCapacityBreakdown(year, month, countByColumnPerDate) {
  const { start, end } = monthBounds(year, month)
  const daysAtLevel = { 1: 0, 2: 0, 3: 0 }
  for (const date of datesInRange(start, end)) {
    const level = Math.min(totalLeaveSlotsForDate(date, countByColumnPerDate), 3)
    if (level >= 1) daysAtLevel[level] += 1
  }
  return [1, 2, 3].map(level => ({ level, days: daysAtLevel[level] }))
}

// Maps one capacity column's own count/max on a single day to one of the 4
// LEAVE_CAPACITY_STATES, by how full that column is *relative to its own
// cap* — unlike capacityStateForCount (which reads a fixed 0-3 combined
// headcount), a column's cap can be 1 or 2, so "half full" means something
// different per column. A cap-1 column has no middle ground: it's either
// available or already at capacity, never "limited"/"near capacity" — which
// is the correct read (there genuinely isn't a partial state to show).
export function categoryDayCapacityState(count, max) {
  if (max == null || count <= 0) return LEAVE_CAPACITY_STATES[0]
  const ratio = count / max
  if (ratio >= 1) return LEAVE_CAPACITY_STATES[3]
  return LEAVE_CAPACITY_STATES[ratio <= 0.5 ? 1 : 2]
}

// Per-day markers for one month, scoped to a single capacity column (or
// 'all' for the existing blended/combined headcount reading) — the mobile
// year overview's per-category "which month has room for my category" view
// (see categoryDayCapacityState above for why this differs from the
// combined-headcount markers monthDayMarkers already provides).
export function monthCapacityMarkers(year, month, columnKey, { countByColumnPerDate, maxByColumnKey, publicHolidaysByDate = new Map() }) {
  const { start, end } = monthBounds(year, month)
  return datesInRange(start, end).map(date => {
    const perColumn = countByColumnPerDate.get(date)
    const count = columnKey === 'all' ? totalLeaveSlotsForDate(date, countByColumnPerDate) : (perColumn?.get(columnKey) || 0)
    const capacityState = columnKey === 'all'
      ? capacityStateForCount(count)
      : categoryDayCapacityState(count, maxByColumnKey[columnKey])
    return {
      date, count, capacityState,
      isPublicHoliday: publicHolidaysByDate.has(date),
      publicHolidayName: publicHolidaysByDate.get(date) || null,
    }
  })
}

// Public holidays falling within a month — the inspector's "public
// holidays" stat for the selected month.
export function monthPublicHolidayCount(year, month, publicHolidaysByDate) {
  const { start, end } = monthBounds(year, month)
  return datesInRange(start, end).filter(date => publicHolidaysByDate.has(date)).length
}

// Every distinct profile+status entry with approved or pending leave
// touching [from, to] — surname, category, status, and that entry's own
// full dateFrom/dateTo — powers the inspector's date-range person list.
// Keyed by profileId+status (not profileId alone): a doctor can easily have
// an approved leave block AND a separate still-pending request both
// touching the same window, and both need to show up — keying on profileId
// alone silently dropped whichever was written last (approved always
// overwrote pending, since approved is applied after pending below), which
// is exactly the bug where a person with both showed only as "Approved"
// with their pending request invisible. Sorted approved-first (approved
// leave is what actually affects available capacity; pending is still
// provisional) then by surname within each group.
export function entriesInRange(from, to, { approvedByDate, pendingByDate }) {
  const byEntry = new Map()
  for (const date of datesInRange(from, to)) {
    for (const e of pendingByDate.get(date) || []) {
      const key = `${e.profileId}:pending`
      if (!byEntry.has(key)) {
        byEntry.set(key, { profileId: e.profileId, surname: e.surname, category: e.category, contractType: e.contractType, status: 'pending', dateFrom: e.dateFrom, dateTo: e.dateTo })
      }
    }
    for (const e of approvedByDate.get(date) || []) {
      byEntry.set(`${e.profileId}:approved`, { profileId: e.profileId, surname: e.surname, category: e.category, contractType: e.contractType, status: 'approved', dateFrom: e.dateFrom, dateTo: e.dateTo })
    }
  }
  return [...byEntry.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'approved' ? -1 : 1
    return a.surname.localeCompare(b.surname)
  })
}
