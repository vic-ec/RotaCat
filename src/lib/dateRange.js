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
