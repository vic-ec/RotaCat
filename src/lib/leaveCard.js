// Text for the compact leave card shared by the Dashboard and the "My
// leave" tab (see LeaveCard.jsx) — kept here as pure string functions so
// the wording/pluralisation is unit-testable without rendering, and so both
// screens can never drift into two slightly different phrasings of the same
// two facts.
import { parseLocalDate, datesInRange, MONTH_ABBR } from './dateRange'

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// "2026-08-24" -> "Mon 24 Aug". No year: a leave card only ever shows
// leave that hasn't happened yet, so the year is either the current one or
// obvious from context, and dropping it keeps the two ends of a range on
// one line on a phone.
export function leaveDateLabel(dateStr) {
  const d = parseLocalDate(dateStr)
  return `${WEEKDAY_ABBR[d.getDay()]} ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`
}

// Calendar days = the full date_from..date_to span (what the person is
// away for). Leave days = annual_leave_days, the requester-entered count
// that actually comes off the annual balance — deliberately only shown for
// leave_type 'annual', because that column is the *only* deducted-days
// field in the schema and is null for every other type. Until a generic
// deducted-days field exists (see the open schema decision), a second
// number for the other types would be invented, not read.
export function leaveDayCountLabel({
  leave_type: leaveType, date_from: dateFrom, date_to: dateTo, annual_leave_days: annualLeaveDays,
}) {
  const calendarDays = datesInRange(dateFrom, dateTo).length
  const calendarPart = `${calendarDays} calendar day${calendarDays === 1 ? '' : 's'}`
  if (leaveType !== 'annual' || annualLeaveDays == null) return calendarPart
  const leaveDays = Number(annualLeaveDays)
  return `${calendarPart} · ${leaveDays} leave day${leaveDays === 1 ? '' : 's'}`
}
