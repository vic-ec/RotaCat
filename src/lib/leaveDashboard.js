// Pure helpers for the Leave dashboard (LeaveDashboard.jsx) — balance math
// and upcoming-request sorting, kept separate from the Supabase fetch so
// they're unit-testable without mocking the client.
import { datesInRange } from './dateRange'

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
// Rows from before annual_leave_days existed fall back to the old
// full-date-range count, clipped to this year the same way the field-based
// path can't be (there's no per-day data to clip in the new path anyway).
export function annualDaysUsedInYear(approvedAnnualRequests, year) {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  let days = 0
  for (const r of approvedAnnualRequests) {
    if (r.annual_leave_days != null) {
      const startYear = Number(r.date_from.slice(0, 4))
      if (startYear === year) days += Number(r.annual_leave_days)
      continue
    }
    const from = r.date_from < yearStart ? yearStart : r.date_from
    const to = r.date_to > yearEnd ? yearEnd : r.date_to
    if (from <= to) days += datesInRange(from, to).length
  }
  return days
}

// Own leave requests (any type/status) that haven't fully passed yet,
// soonest first, capped to `limit` for a compact dashboard list.
export function upcomingRequests(requests, todayStr, limit = 5) {
  return requests
    .filter(r => r.date_to >= todayStr)
    .sort((a, b) => a.date_from.localeCompare(b.date_from))
    .slice(0, limit)
}
