// Pure helpers for the Weekend Planner's year-overview page
// (WeekendYearOverview.jsx) — a 12-month "who still needs staffing" summary
// that fronts the existing month-at-a-time grid (WeekendPlannerView.jsx,
// still reachable as the "month view" these open into). Kept separate from
// the Supabase fetch/components so it's unit-testable without mocking the
// client, mirroring annualPlannerOverview.js.
import { saturdaysInMonth, weekendCoverageSummary, weekendHealthState } from './weekendPlanner'

// Per-Saturday markers for one month's compact overview card: which of the
// 4 rotation groups are filled (health, see weekendHealthState) and how
// many are still open (gapCount) — powers each WeekendMonthCard's row of
// small squares. byWeekend is the { [saturday]: { [groupKey]: [entry,...] } }
// Map from groupEntriesByWeekend.
export function monthWeekendMarkers(year, month, byWeekend) {
  return saturdaysInMonth(year, month).map(saturday => {
    const bySaturday = byWeekend.get(saturday)
    const { filledGroups, totalGroups } = weekendCoverageSummary(bySaturday)
    return { saturday, health: weekendHealthState(bySaturday), gapCount: totalGroups - filledGroups }
  })
}

// Whole-year totals — how many weekends across all 12 months of `year` are
// fully planned, partially planned, or completely empty. Powers the year
// overview inspector's "This year" stat block.
export function yearWeekendTotals(year, byWeekend) {
  let fullyPlanned = 0
  let partial = 0
  let empty = 0
  for (let month = 1; month <= 12; month++) {
    for (const saturday of saturdaysInMonth(year, month)) {
      const health = weekendHealthState(byWeekend.get(saturday))
      if (health === 'green') fullyPlanned += 1
      else if (health === 'amber') partial += 1
      else empty += 1
    }
  }
  return { fullyPlanned, partial, empty, total: fullyPlanned + partial + empty }
}
