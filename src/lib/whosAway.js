import { addDays, parseLocalDate, MONTH_ABBR, formatShortDateRange } from './dateRange'
import { totalCalendarDays } from './leaveMatrix'

// "Who's away" (Team Leave → Current & Upcoming): approved leave that has
// not ended yet, grouped by when it happens. Pending leave stays in
// Requests — this list answers "who won't be here", so only decided leave
// counts. The first two windows match the Dashboard's Team leave card
// (Away today, Next 7 days).
//
//   today   covers today
//   next7   starts within the next 7 days
//   next14  starts 8–14 days from now
//   later   starts after that
//
// A doctor with two absences shows once in each group a leave falls in.
export const WHOS_AWAY_GROUPS = [
  { key: 'today', label: 'Away today' },
  { key: 'next7', label: 'Next 7 days' },
  { key: 'next14', label: 'Next 2 weeks' },
  { key: 'later', label: 'Later' },
]

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function sortKey(lr) {
  return `${lr.date_from} ${lr.profiles?.surname || ''} ${lr.profiles?.name || ''}`.toLowerCase()
}

export function groupWhosAway(requests, today) {
  const in7 = addDays(today, 7)
  const in14 = addDays(today, 14)
  const groups = Object.fromEntries(WHOS_AWAY_GROUPS.map(g => [g.key, []]))
  for (const lr of requests) {
    if (lr.status !== 'approved' || !lr.date_from || !lr.date_to || lr.date_to < today) continue
    if (lr.date_from <= today) groups.today.push(lr)
    else if (lr.date_from <= in7) groups.next7.push(lr)
    else if (lr.date_from <= in14) groups.next14.push(lr)
    else groups.later.push(lr)
  }
  for (const list of Object.values(groups)) list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  return WHOS_AWAY_GROUPS.map(g => ({ ...g, items: groups[g.key] }))
}

// "Wed 25 Nov"
export function shortWeekdayDate(dateStr) {
  const d = parseLocalDate(dateStr)
  return `${WEEKDAY_ABBR[d.getDay()]} ${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`
}

// The "when" half of a row. Away today says when the doctor is back — the
// question asked on a shift; later groups give the dates and the length.
export function whosAwayWhen(lr, groupKey) {
  if (groupKey === 'today') return `back ${shortWeekdayDate(addDays(lr.date_to, 1))}`
  const days = totalCalendarDays(lr)
  return `${formatShortDateRange(lr.date_from, lr.date_to)} · ${days} day${days === 1 ? '' : 's'}`
}
