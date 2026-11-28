import { buildCalendarDays, buildWeeks, buildEntryMap } from './rosterCalendar'

// The month's days and weeks, the ones on screen, and the entries keyed by
// date and shift. Moved out of RosterGridPage as it was.
export function useRosterCalendar({ rosterMonth, publicHolidays, viewMode, currentWeek, entries, shiftTypes }) {
  // Build calendar days for this month
  const calendarDays = rosterMonth ? buildCalendarDays(rosterMonth.year, rosterMonth.month, publicHolidays) : []
  const weeks = buildWeeks(calendarDays)
  const visibleDays = viewMode === 'week' ? (weeks[currentWeek] || []) : calendarDays

  // Group entries by date + shift code for fast lookup
  const entryMap = buildEntryMap(entries, shiftTypes)

  return { calendarDays, weeks, visibleDays, entryMap }
}
