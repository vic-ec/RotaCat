// Pure helpers behind the shared planner calendar (PlannerCalendarGrid) and
// the capacity bar (CapacityBar) — the Monday-first month layout both leave
// planners draw, and the "how many days sit at each slot level" bucketing
// the bar and its legend read. Kept apart from leaveYearGrid.js, whose
// weeksForMonth is Sunday-first and still serves Team Leave's month view,
// and from dateRange.js, whose WEEKDAY_NAMES must stay keyed by getDay().
import { dayOfWeek } from './dateRange'
import { datesInMonth } from './leaveYearGrid'

export const WEEKDAY_NAMES_MONDAY_FIRST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const WEEKDAY_SHORT_MONDAY_FIRST = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// Monday-start weeks covering a month, padded with null on either end so
// every week is exactly 7 cells — the leave planners' week, as on the
// team's own EC Leave Planner sheet. (getDay() is Sunday=0, so Monday's
// leading-blank count is (getDay + 6) % 7.)
export function weeksForMonthMondayFirst(year, month) {
  const dates = datesInMonth(year, month)
  const leadingBlanks = (dayOfWeek(dates[0]) + 6) % 7
  const trailingBlanks = (7 - dayOfWeek(dates[dates.length - 1])) % 7
  const cells = [
    ...Array(leadingBlanks).fill(null),
    ...dates,
    ...Array(trailingBlanks).fill(null),
  ]
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function isWeekendDate(date) {
  const d = dayOfWeek(date)
  return d === 0 || d === 6
}

// How many days of a month sit at each slot level: 0, 1, 2 … `max`, with
// the last bucket holding `max` AND anything above it ("3+"). `usedOn(date)`
// is the day's count — the Annual planner passes totalLeaveSlotsForDate,
// Special its own shared-guideline count — so the same bar serves both.
// Every level is always present (zero days included), since the legend
// lists all four, greyed where empty.
export function daysBySlotsUsed(year, month, usedOn, { max = 3 } = {}) {
  const days = Array(max + 1).fill(0)
  for (const date of datesInMonth(year, month)) {
    days[Math.min(usedOn(date), max)] += 1
  }
  return days.map((count, level) => ({ level, days: count }))
}

// The bar legend's default wording per level: "0 of 3 used", "1 of 3",
// "2 of 3", "full". Special passes its own last label ("at guideline").
export function capacityBarLabels(max = 3) {
  return Array.from({ length: max + 1 }, (_, i) => `${i}/${max} slots used`)
}
