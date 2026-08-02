// Pure helpers for the Annual Leave planner's year-overview page
// (AnnualPlannerOverview.jsx) — a 12-month "decision" summary that now
// fronts the existing day-row spreadsheet (kept as the "month workspace"
// for detailed review/editing), kept separate from the Supabase fetch so
// it's unit-testable without mocking the client.
import { datesInRange, monthBounds } from './dateRange'
import { LEAVE_CAPACITY_COLUMNS } from './leaveYearGrid'

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
// caller of this needs PH markers.
export function monthDayMarkers(year, month, { approvedByDate, pendingByDate, pressureDates, publicHolidaysByDate = new Map() }) {
  const { start, end } = monthBounds(year, month)
  return datesInRange(start, end).map(date => ({
    date,
    hasApproved: (approvedByDate.get(date) || []).length > 0,
    hasPending: (pendingByDate.get(date) || []).length > 0,
    isPressure: pressureDates.has(date),
    isPublicHoliday: publicHolidaysByDate.has(date),
    publicHolidayName: publicHolidaysByDate.get(date) || null,
  }))
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

// Per-capacity-column peak concurrent-leave count reached within a month,
// and how many days that peak was reached — powers the inspector's
// "capacity by category" breakdown for the selected month, e.g. "1/1, 16
// days" for a column that hit its cap of 1 on 16 different days, or "1/2, 8
// days" for a column that never reached its cap of 2 but still had one
// person on leave on 8 days. peak is 0 (nothing to show) when nobody in
// that column has any leave on record that month at all.
export function monthCapacityPeakByColumn(year, month, countByColumnPerDate, maxByColumnKey) {
  const { start, end } = monthBounds(year, month)
  const dates = datesInRange(start, end)
  return LEAVE_CAPACITY_COLUMNS.map(col => {
    const max = maxByColumnKey[col.key]
    const counts = dates.map(date => countByColumnPerDate.get(date)?.get(col.key) || 0)
    const peak = Math.max(0, ...counts)
    const daysAtPeak = peak > 0 ? counts.filter(c => c === peak).length : 0
    return { key: col.key, label: col.label, peak, max, daysAtPeak }
  })
}

// Public holidays falling within a month — the inspector's "public
// holidays" stat for the selected month (distinct from the year-total
// count in the toolbar strip above).
export function monthPublicHolidayCount(year, month, publicHolidaysByDate) {
  const { start, end } = monthBounds(year, month)
  return datesInRange(start, end).filter(date => publicHolidaysByDate.has(date)).length
}

// Every distinct profile with approved or pending leave touching
// [from, to], surname + status only (approved wins if a profile somehow
// has both on record) — powers the inspector's date-range person list.
export function entriesInRange(from, to, { approvedByDate, pendingByDate }) {
  const byProfile = new Map()
  for (const date of datesInRange(from, to)) {
    for (const e of pendingByDate.get(date) || []) {
      if (!byProfile.has(e.profileId)) byProfile.set(e.profileId, { surname: e.surname, status: 'pending' })
    }
    for (const e of approvedByDate.get(date) || []) {
      byProfile.set(e.profileId, { surname: e.surname, status: 'approved' })
    }
  }
  return [...byProfile.values()].sort((a, b) => a.surname.localeCompare(b.surname))
}
