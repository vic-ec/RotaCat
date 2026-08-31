// Shape helpers for the Special leave planner's two views — the 12-month
// overview (SpecialPlannerOverview) and the single-month workspace
// (SpecialMonthWorkspace). Mirrors what leaveYearGrid.js does for the
// Annual planner, kept separate because the two planners answer different
// questions off the same table.
//
// The key difference from Annual: special leave has no ENFORCED cap. The
// EC Leave Planner sheet documents a guideline of no more than
// SPECIAL_LEAVE_SOFT_CAP (3) doctors on special leave at once, and that
// guideline is what colours the day cells here — deliberately reusing
// Annual's own capacityStateForCount, which clamps at 3, so the same
// count reads as the same colour on both planners.
import { datesInMonth, capacityStateForCount } from './leaveYearGrid'
import { dayOfWeek } from './dateRange'
import { SPECIAL_LEAVE_TYPES, SPECIAL_LEAVE_SOFT_CAP } from './leaveRequests'

// Distinct doctors per date, counting only genuine special leave. The
// planner's own `byDate` deliberately also carries sick leave and pending
// annual (both worth seeing on the tab), but neither is what the 3-doctor
// guideline is about, so neither colours a day.
export function specialCountsByDate(byDate) {
  const counts = new Map()
  for (const [date, entries] of byDate) {
    const ids = new Set(
      entries.filter(e => SPECIAL_LEAVE_TYPES.includes(e.leaveType)).map(e => e.profileId)
    )
    counts.set(date, ids.size)
  }
  return counts
}

// One month's day cells for the overview's mini-calendar and the
// workspace's grid: every real date in the month, its distinct-doctor
// count, the capacity state that count maps to, and its public holiday if
// it has one.
export function specialMonthMarkers(year, month, countsByDate, publicHolidaysByDate = new Map()) {
  return datesInMonth(year, month).map(date => {
    const count = countsByDate.get(date) || 0
    return {
      date,
      count,
      capacityState: capacityStateForCount(count),
      overSoftCap: count >= SPECIAL_LEAVE_SOFT_CAP,
      isPublicHoliday: publicHolidaysByDate.has(date),
      publicHolidayName: publicHolidaysByDate.get(date) || null,
    }
  })
}

// Monday-start leading blanks for a month's mini-calendar, so a month card
// lines its days up under the same weekday columns the Annual planner's
// own MonthCard does.
export function leadingBlanksForMonth(markers) {
  if (markers.length === 0) return 0
  return (dayOfWeek(markers[0].date) + 6) % 7
}

// Headline numbers for one month: how many distinct doctors have special
// leave in it, how many requests are approved vs pending, and how many
// days sit at or above the guideline. Counts every entry the planner
// shows (sick and pending annual included) for the request tallies, since
// those are "what is on this tab this month"; the pressure day count stays
// special-leave-only, matching the guideline it reports against.
export function specialMonthStats(year, month, byDate, countsByDate) {
  const dates = datesInMonth(year, month)
  const people = new Set()
  const approved = new Set()
  const pending = new Set()
  let pressureDays = 0

  for (const date of dates) {
    if ((countsByDate.get(date) || 0) >= SPECIAL_LEAVE_SOFT_CAP) pressureDays += 1
    for (const entry of byDate.get(date) || []) {
      people.add(entry.profileId)
      // Keyed per request, not per day, so a five-day block counts once.
      const key = `${entry.profileId}-${entry.leaveType}-${entry.dateFrom}`
      if (entry.status === 'pending') pending.add(key)
      else approved.add(key)
    }
  }
  return { people: people.size, approved: approved.size, pending: pending.size, pressureDays }
}

// Every entry touching a month, one row per request rather than per day,
// sorted by start date then surname — the inspector's "what is happening
// this month" list.
export function specialMonthEntries(year, month, byDate) {
  const seen = new Map()
  for (const date of datesInMonth(year, month)) {
    for (const entry of byDate.get(date) || []) {
      const key = `${entry.profileId}-${entry.leaveType}-${entry.dateFrom}`
      if (!seen.has(key)) seen.set(key, entry)
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.dateFrom.localeCompare(b.dateFrom) || (a.surname || '').localeCompare(b.surname || ''))
}
