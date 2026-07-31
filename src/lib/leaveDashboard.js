// Pure helpers for the Leave dashboard (LeaveDashboard.jsx) — balance math
// and upcoming-request sorting, kept separate from the Supabase fetch so
// they're unit-testable without mocking the client.
import { datesInRange } from './dateRange'

// Sums inclusive days across approved annual leave_requests, clipped to the
// given calendar year (a request may span into an adjacent year — only the
// days actually inside `year` count toward that year's allowance).
export function annualDaysUsedInYear(approvedAnnualRequests, year) {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  let days = 0
  for (const r of approvedAnnualRequests) {
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
