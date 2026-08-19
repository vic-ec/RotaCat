// Pure helpers for the Leave dashboard (LeaveDashboard.jsx) and the admin
// Audit report (leaveAudit.js) — day-count math and upcoming-request
// sorting, kept separate from the Supabase fetch so they're unit-testable
// without mocking the client. The *InRange functions take an arbitrary
// [rangeFrom, rangeTo] (the Audit report's admin-chosen date range); the
// *UsedInYear/pendingRequestCount functions are thin year-scoped wrappers
// around them, kept for the doctor-facing "My leave" tracker (which always
// resets to the current calendar year).

import { datesInRange } from './dateRange'

// Sums the full date_from..date_to span of each request that overlaps
// [rangeFrom, rangeTo], clipping (not attributing wholesale) a request that
// only partially overlaps so it only counts the days actually inside the
// range. Used for leave types with no partial-day field of their own
// (everything except 'annual', which has annual_leave_days — see
// annualDaysInRange below).
export function totalDaysInRange(requests, rangeFrom, rangeTo) {
  let days = 0
  for (const r of requests) {
    const from = r.date_from < rangeFrom ? rangeFrom : r.date_from
    const to = r.date_to > rangeTo ? rangeTo : r.date_to
    if (from <= to) days += datesInRange(from, to).length
  }
  return days
}

export function totalDaysUsedInYear(requests, year) {
  return totalDaysInRange(requests, `${year}-01-01`, `${year}-12-31`)
}

// Sums days that actually count against the annual leave allowance within
// [rangeFrom, rangeTo]. Prefers each request's explicit annual_leave_days
// (the requester-entered count — a request's [date_from, date_to] can be
// wider than this, e.g. a padding weekend that doesn't reduce the balance)
// over the full date range. annual_leave_days is a single count for the
// whole request, not attributable to specific days, so a request that
// overlaps [rangeFrom, rangeTo] is given a share of annual_leave_days
// proportional to how many of its calendar days fall inside the range (out
// of its own full date_from..date_to span) — e.g. a 5-day annual request
// spanning 29 Dec-2 Jan (3 days in one year, 2 in the next) shows 3 in the
// first year's tracker and 2 in the second's once the tracker resets on 1
// January, instead of dumping the whole count into whichever year the
// request happens to start in. A request entirely inside one range gets
// the full annual_leave_days, same as before.
//
// This can't be exact for a request that also has padding (annual_leave_days
// less than the full range) — there's no per-day data saying which specific
// calendar days are the "core" annual days vs. the padding, so the
// proportional share is the best available estimate in that case, not a
// precise attribution. Because each range is rounded independently, two
// complementary ranges (e.g. either side of a year boundary) can very
// rarely land a day off from the true total as a result — an acceptable
// trade-off for a flat count instead of day-level data.
//
// Rows from before annual_leave_days existed fall back to totalDaysInRange
// (clipped to the range, since there's no per-day data to attribute
// wholesale in that path anyway).
export function annualDaysInRange(approvedAnnualRequests, rangeFrom, rangeTo) {
  const explicit = approvedAnnualRequests.filter(r => r.annual_leave_days != null)
  const legacy = approvedAnnualRequests.filter(r => r.annual_leave_days == null)
  let days = totalDaysInRange(legacy, rangeFrom, rangeTo)
  for (const r of explicit) {
    const totalRangeDays = datesInRange(r.date_from, r.date_to).length
    const overlapFrom = r.date_from < rangeFrom ? rangeFrom : r.date_from
    const overlapTo = r.date_to > rangeTo ? rangeTo : r.date_to
    if (overlapFrom > overlapTo) continue
    const overlapDays = datesInRange(overlapFrom, overlapTo).length
    days += Math.round(Number(r.annual_leave_days) * overlapDays / totalRangeDays)
  }
  return days
}

export function annualDaysUsedInYear(approvedAnnualRequests, year) {
  return annualDaysInRange(approvedAnnualRequests, `${year}-01-01`, `${year}-12-31`)
}

// Counts pending requests (not days) starting inside [rangeFrom, rangeTo] —
// a request isn't "taken" (and doesn't have a settled day count) until it's
// approved, so trackers show a request count instead of a day count for
// the pending side.
export function pendingRequestCountInRange(requests, rangeFrom, rangeTo) {
  return requests.filter(r => r.status === 'pending' && r.date_from >= rangeFrom && r.date_from <= rangeTo).length
}

export function pendingRequestCount(requests, year) {
  return pendingRequestCountInRange(requests, `${year}-01-01`, `${year}-12-31`)
}

// One tracker per leave type the person has any history with in `year` —
// any request of that type (any status) overlapping the calendar year, so a
// type they've never touched never shows up as a row of zeroes.
//
// Annual is the only type with a real day figure: `approvedDays` sums
// annual_leave_days (via annualDaysInRange) because that's the column the
// balance is actually deducted from. Every other type has no deducted-days
// field in the schema at all, so it reports `approvedRequests` — a count of
// approved requests — and `approvedDays` stays null rather than showing a
// calendar-day span dressed up as a leave balance. If a generic
// deducted-days field lands later, those types get `approvedDays` here and
// the callers keep working unchanged.
//
// `typeOrder` (e.g. LEAVE_TYPE_OPTIONS' values) fixes display order; types
// missing from it sort last, in first-seen order.
export function leaveTrackersForYear(requests, year, typeOrder = []) {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const inYear = requests.filter(r => r.date_to >= from && r.date_from <= to)

  const byType = new Map()
  for (const r of inYear) {
    if (!byType.has(r.leave_type)) byType.set(r.leave_type, [])
    byType.get(r.leave_type).push(r)
  }

  const trackers = [...byType.entries()].map(([leaveType, rows]) => {
    const approved = rows.filter(r => r.status === 'approved')
    return {
      leaveType,
      approvedDays: leaveType === 'annual' ? annualDaysInRange(approved, from, to) : null,
      approvedRequests: approved.length,
      pendingRequests: pendingRequestCountInRange(rows, from, to),
    }
  })

  const rank = t => {
    const i = typeOrder.indexOf(t)
    return i === -1 ? typeOrder.length : i
  }
  return trackers.sort((a, b) => rank(a.leaveType) - rank(b.leaveType))
}

// Own leave requests (any type/status) that haven't fully passed yet,
// soonest first, capped to `limit` for a compact dashboard list.
export function upcomingRequests(requests, todayStr, limit = 5) {
  return requests
    .filter(r => r.date_to >= todayStr)
    .sort((a, b) => a.date_from.localeCompare(b.date_from))
    .slice(0, limit)
}
