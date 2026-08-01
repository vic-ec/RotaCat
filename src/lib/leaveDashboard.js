// Pure helpers for the Leave dashboard (LeaveDashboard.jsx) — tracker math
// and upcoming-request sorting, kept separate from the Supabase fetch so
// they're unit-testable without mocking the client.
import { datesInRange } from './dateRange'

// Sums the full date_from..date_to span of each request that falls within
// the given calendar year, clipping (not attributing wholesale) a request
// that spans a year boundary so each year's call only counts its own days
// without double-counting. Used for leave types with no partial-day field
// of their own (everything except 'annual', which has annual_leave_days —
// see annualDaysUsedInYear below).
export function totalDaysUsedInYear(requests, year) {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  let days = 0
  for (const r of requests) {
    const from = r.date_from < yearStart ? yearStart : r.date_from
    const to = r.date_to > yearEnd ? yearEnd : r.date_to
    if (from <= to) days += datesInRange(from, to).length
  }
  return days
}

// Sums days that actually count against the annual leave allowance for the
// given calendar year. Prefers each request's explicit annual_leave_days
// (the requester-entered count — a request's [date_from, date_to] can be
// wider than this, e.g. a padding weekend that doesn't reduce the balance)
// over the full date range. annual_leave_days is a single count for the
// whole request, not attributable to specific days, so a request is
// attributed entirely to the year it starts in rather than split across a
// year boundary — a rare edge case, and this avoids double-counting across
// two separate calls (once per year).
//
// Rows from before annual_leave_days existed fall back to totalDaysUsedInYear
// (clipped to this year, since there's no per-day data to attribute wholesale
// in that path anyway).
export function annualDaysUsedInYear(approvedAnnualRequests, year) {
  const explicit = approvedAnnualRequests.filter(r => r.annual_leave_days != null)
  const legacy = approvedAnnualRequests.filter(r => r.annual_leave_days == null)
  let days = totalDaysUsedInYear(legacy, year)
  for (const r of explicit) {
    const startYear = Number(r.date_from.slice(0, 4))
    if (startYear === year) days += Number(r.annual_leave_days)
  }
  return days
}

// Counts pending requests (not days) starting in the given year — the
// dashboard tracker shows "N requests pending" rather than a day count for
// the pending side, since a request isn't "taken" (and doesn't have a
// settled day count) until it's approved.
export function pendingRequestCount(requests, year) {
  return requests.filter(r => r.status === 'pending' && Number(r.date_from.slice(0, 4)) === year).length
}

// Own leave requests (any type/status) that haven't fully passed yet,
// soonest first, capped to `limit` for a compact dashboard list.
export function upcomingRequests(requests, todayStr, limit = 5) {
  return requests
    .filter(r => r.date_to >= todayStr)
    .sort((a, b) => a.date_from.localeCompare(b.date_from))
    .slice(0, limit)
}
