import { addDays, dayOfWeek, datesInRange } from './dateRange'
import { doctorFromRequest } from './leaveMatrix'

// Pure helpers behind the mobile Team Leave views (TeamLeaveMobile.jsx and its
// Week/Month/People children) — the date/agenda maths kept out of the
// components so they stay thin and this stays unit-testable. Mirrors how
// leaveMatrix.js backs the desktop matrix. Only approved + pending leave is
// ever considered "away"; rejected/withdrawn is ignored.

const ACTIVE_STATUSES = new Set(['approved', 'pending'])

function surnameKey(lr) {
  return `${lr.profiles?.surname || ''} ${lr.profiles?.name || ''}`.toLowerCase()
}

function coversDate(lr, dateStr) {
  return lr.date_from <= dateStr && lr.date_to >= dateStr
}

// Sunday-start week containing `dateStr` (app convention — WEEKDAY_SHORT is
// ['Su',…,'Sa'] and weeksForMonth is Sunday-start). dateRange.js has no week
// helper of its own, so this is the one genuinely new date primitive.
export function weekStart(dateStr) {
  return addDays(dateStr, -dayOfWeek(dateStr))
}

export function weekBounds(dateStr) {
  const start = weekStart(dateStr)
  return { start, end: addDays(start, 6) }
}

// The summarised week agenda: an "On leave" section anchored to today (or the
// week's start when browsing another week) plus leave that *starts* later in
// the same week, grouped by start day. A person on multi-day leave shows once
// (in `onLeave` if they're already away at the anchor, otherwise under their
// start day) — never repeated across every day they're absent.
export function buildWeekAgenda(requests, weekStartStr, today) {
  const end = addDays(weekStartStr, 6)
  const withinWeek = today >= weekStartStr && today <= end
  const anchor = withinWeek ? today : weekStartStr
  const active = requests.filter(r => ACTIVE_STATUSES.has(r.status) && r.profile_id)

  const onLeave = active
    .filter(r => coversDate(r, anchor))
    .sort((a, b) => a.date_to.localeCompare(b.date_to) || surnameKey(a).localeCompare(surnameKey(b)))

  const byDay = new Map()
  for (const r of active) {
    // Starts strictly after the anchor (so someone already shown as on-leave
    // at the anchor isn't also listed under a later start day) but within the
    // displayed week.
    if (r.date_from > anchor && r.date_from <= end) {
      if (!byDay.has(r.date_from)) byDay.set(r.date_from, [])
      byDay.get(r.date_from).push(r)
    }
  }
  const startingByDay = [...byDay.keys()].sort().map(date => ({
    date,
    items: byDay.get(date).sort((a, b) => surnameKey(a).localeCompare(surnameKey(b))),
  }))

  return { anchor, onLeave, startingByDay }
}

function preferApprovedThenLongest(a, b) {
  const rank = s => (s === 'approved' ? 0 : 1)
  return rank(a.status) - rank(b.status) || b.date_to.localeCompare(a.date_to)
}

// One entry per person who has any approved/pending leave on record, with
// their `current` leave (covering today, approved preferred), their `next`
// upcoming leave, and the full `items` list (soonest first) for the person
// sheet. Sorted by surname. People with no leave simply aren't present — the
// "People = leave-only" choice, so no separate profiles fetch is needed.
export function buildPeopleLeave(requests, today) {
  const byPerson = new Map()
  for (const r of requests) {
    if (!ACTIVE_STATUSES.has(r.status) || !r.profile_id) continue
    if (!byPerson.has(r.profile_id)) byPerson.set(r.profile_id, { doctor: doctorFromRequest(r), items: [] })
    byPerson.get(r.profile_id).items.push(r)
  }
  const people = []
  for (const { doctor, items } of byPerson.values()) {
    const sorted = [...items].sort((a, b) => a.date_from.localeCompare(b.date_from))
    const current = items.filter(r => coversDate(r, today)).sort(preferApprovedThenLongest)[0] || null
    const next = sorted.find(r => r.date_from > today) || null
    people.push({ doctor, current, next, items: sorted })
  }
  people.sort((a, b) =>
    (a.doctor.surname || '').localeCompare(b.doctor.surname || '') ||
    (a.doctor.name || '').localeCompare(b.doctor.name || ''))
  return people
}

// Map<dateStr, {doctor, request, status}[]> for the given ordered `dates`
// (one month's worth), deduped per person per day (approved wins over a
// pending row for the same person). Powers the Month view's per-day counts
// (array length) and its tap-a-day sheet (the array).
export function peopleAwayByDate(requests, dates) {
  if (dates.length === 0) return new Map()
  const first = dates[0]
  const last = dates[dates.length - 1]
  const perDay = new Map(dates.map(d => [d, new Map()])) // date -> Map(profileId -> {doctor, request, status})

  for (const r of requests) {
    if (!ACTIVE_STATUSES.has(r.status) || !r.profile_id) continue
    const from = r.date_from < first ? first : r.date_from
    const to = r.date_to > last ? last : r.date_to
    if (from > to) continue
    for (const d of datesInRange(from, to)) {
      const dayMap = perDay.get(d)
      if (!dayMap) continue
      const existing = dayMap.get(r.profile_id)
      if (!existing || (existing.status !== 'approved' && r.status === 'approved')) {
        dayMap.set(r.profile_id, { doctor: doctorFromRequest(r), request: r, status: r.status })
      }
    }
  }

  const result = new Map()
  for (const d of dates) result.set(d, [...perDay.get(d).values()])
  return result
}
