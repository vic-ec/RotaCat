// Shared date-range helpers — plain "YYYY-MM-DD" strings throughout, parsed
// as local dates (never via Date.toISOString(), which shifts by timezone —
// see the same convention already used in RosterGridPage.jsx).

export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(dateStr, days) {
  const date = parseLocalDate(dateStr)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

// Inclusive list of "YYYY-MM-DD" strings from dateFrom to dateTo.
export function datesInRange(dateFrom, dateTo) {
  const dates = []
  let cursor = dateFrom
  while (cursor <= dateTo) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

// Inclusive overlap between two [from, to] date ranges (string comparison
// is safe for "YYYY-MM-DD").
export function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo
}

export function dayOfWeek(dateStr) {
  return parseLocalDate(dateStr).getDay() // 0=Sun … 6=Sat
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-08-10" -> "Monday, 10 Aug 2026" — the single-date display format
// used wherever a full weekday name reads better than an abbreviation (e.g.
// the Annual planner's Day View).
export function formatWeekdayDate(dateStr) {
  const d = parseLocalDate(dateStr)
  return `${WEEKDAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`
}

// "2026-08-15" -> "15 Aug"; "2026-08-15" to "2026-08-20" -> "15–20 Aug"; or
// "2026-08-28" to "2026-09-03" -> "28 Aug–3 Sep" when it crosses a month
// boundary. The compact per-entry date-range display used in the leave
// planner's day sheet and inspector (e.g. "who's off, and for how long").
export function formatShortDateRange(dateFrom, dateTo) {
  const [, fromMonth, fromDay] = dateFrom.split('-').map(Number)
  const [, toMonth, toDay] = dateTo.split('-').map(Number)
  if (dateFrom === dateTo) return `${fromDay} ${MONTH_ABBR[fromMonth - 1]}`
  const from = fromMonth === toMonth ? `${fromDay}` : `${fromDay} ${MONTH_ABBR[fromMonth - 1]}`
  return `${from}–${toDay} ${MONTH_ABBR[toMonth - 1]}`
}

// First/last "YYYY-MM-DD" of a calendar month (1-indexed month).
export function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export function todayStr() {
  const n = new Date()
  return formatLocalDate(n)
}
