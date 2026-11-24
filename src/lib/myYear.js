// Every figure on the "My year" page, All Leave's By month view and Hours
// Summary's days-in-lieu columns — worked out here, from rows the caller
// has already read (leave_requests, roster_entries, public_holidays).
// Pure: no Supabase, no clock (callers pass `today`). Components format
// what these return; they do not calculate.
import { addDays, datesInRange, monthBounds, parseLocalDate, dayOfWeek } from './dateRange'
import { annualDaysInRange } from './leaveDashboard'
import { leaveTypeGroupKey } from './leaveMatrix'

// Stored as a leave type, but a weekend-off arrangement rather than leave:
// never counted in a total, a month cell or the leave record (All Leave's
// By leave type table leaves it out the same way).
export const NOT_LEAVE_TYPES = new Set(['weekend_exception'])

// Which leave types count as a break, and how long one has to be.
export const BREAK_LEAVE_TYPES = ['annual']
export const BREAK_MIN_DAYS = 5

export const LIEU_LEAVE_TYPE = 'time_off_in_lieu'

export const MY_YEAR_SETTING_KEYS = ['attendance_visible_to_staff', 'my_year_long_break_days', 'lieu_count_night_before_ph']
export const DEFAULT_LONG_BREAK_DAYS = 120

// app_settings rows -> the three values these pages read, with the
// migration's defaults for a row that is missing (a cached shell ahead of
// the migration, or offline).
export function readMyYearSettings(rows) {
  const byKey = Object.fromEntries((rows || []).map(r => [r.key, r.value]))
  const days = Number(byKey.my_year_long_break_days)
  return {
    attendanceVisibleToStaff: (byKey.attendance_visible_to_staff ?? 'true') === 'true',
    longBreakDays: Number.isFinite(days) && days > 0 ? days : DEFAULT_LONG_BREAK_DAYS,
    lieuCountNightBefore: byKey.lieu_count_night_before_ph === 'true',
  }
}

// '08:00:00' -> '08h00'
export function shiftStartLabel(time) {
  const [h, m] = String(time || '').split(':')
  return h && m ? `${h}h${m}` : ''
}

export function daysBetween(fromStr, toStr) {
  return Math.round((parseLocalDate(toStr) - parseLocalDate(fromStr)) / 86400000)
}

const yearStart = year => `${year}-01-01`
const yearEnd = year => `${year}-12-31`
const touches = (r, from, to) => r.date_from <= to && r.date_to >= from
const clipDays = (r, from, to) => {
  const a = r.date_from < from ? from : r.date_from
  const b = r.date_to > to ? to : r.date_to
  return a <= b ? datesInRange(a, b).length : 0
}

// ── Leave days ─────────────────────────────────────────────────────────

// annual | sick | other — the three figures every summary splits leave into.
export function leaveBucket(leaveType) {
  if (leaveType === 'annual') return 'annual'
  if (leaveType === 'sick') return 'sick'
  return 'other'
}

// Approved leave that counts. Pending, rejected and cancelled never do.
export function isCountedLeave(request) {
  return request.status === 'approved' && !NOT_LEAVE_TYPES.has(request.leave_type)
}

// Days one request costs inside [from, to] — the rule Hours Summary uses:
// annual leave counts annual_leave_days (a proportional share when only
// part of the request is inside the range); every other type counts
// calendar days.
export function leaveDaysInRange(request, from, to) {
  if (request.leave_type === 'annual') return annualDaysInRange([request], from, to)
  return clipDays(request, from, to)
}

// The same figure split over the twelve months of `year`, so the months
// always add up to the year. Annual leave across a month end is shared in
// proportion to the calendar days in each month, whole days only, with the
// odd day going to the month holding the larger part.
export function leaveDaysByMonth(request, year) {
  const calendar = Array.from({ length: 12 }, (_, i) => {
    const { start, end } = monthBounds(year, i + 1)
    return clipDays(request, start, end)
  })
  if (request.leave_type !== 'annual' || request.annual_leave_days == null) return calendar

  const total = leaveDaysInRange(request, yearStart(year), yearEnd(year))
  const weight = calendar.reduce((s, d) => s + d, 0)
  if (weight === 0) return calendar
  const exact = calendar.map(d => total * d / weight)
  const months = exact.map(Math.floor)
  let left = total - months.reduce((s, d) => s + d, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    if (calendar[i] === 0) continue
    months[i] += 1
    left -= 1
  }
  return months
}

// One person's year by month: days per month (all leave types together),
// the leave behind each month, and the annual / sick / other split.
// Invariant: the twelve months add up to `total`, and
// total = annual + sick + other.
export function buildMonthRow(requests, year) {
  const months = Array(12).fill(0)
  const entries = Array.from({ length: 12 }, () => [])
  const split = { annual: 0, sick: 0, other: 0 }
  for (const r of requests || []) {
    if (!isCountedLeave(r) || !touches(r, yearStart(year), yearEnd(year))) continue
    const bucket = leaveBucket(r.leave_type)
    leaveDaysByMonth(r, year).forEach((days, i) => {
      const { start, end } = monthBounds(year, i + 1)
      if (!touches(r, start, end)) return
      months[i] += days
      split[bucket] += days
      entries[i].push({ request: r, days, bucket })
    })
  }
  for (const list of entries) list.sort((a, b) => a.request.date_from.localeCompare(b.request.date_from))
  return { months, entries, ...split, total: split.annual + split.sick + split.other }
}

// The totals card. `today` splits booked annual leave into taken and
// upcoming; `allowance` is the annual entitlement in days.
export function leaveTotals(requests, year, today, allowance) {
  const ys = yearStart(year)
  const ye = yearEnd(year)
  const rows = (requests || []).filter(r => !NOT_LEAVE_TYPES.has(r.leave_type))
  const approved = rows.filter(r => r.status === 'approved')
  const annual = approved.filter(r => r.leave_type === 'annual')
  const booked = annual.reduce((s, r) => s + leaveDaysInRange(r, ys, ye), 0)

  const yesterday = addDays(today, -1)
  const takenTo = yesterday > ye ? ye : yesterday
  const taken = takenTo < ys ? 0 : Math.min(booked, annual.reduce((s, r) => s + leaveDaysInRange(r, ys, takenTo), 0))

  const sick = approved.filter(r => r.leave_type === 'sick' && touches(r, ys, ye))
  return {
    allowance,
    daysLeft: allowance - booked,
    daysBooked: booked,
    daysTaken: taken,
    daysUpcoming: booked - taken,
    pendingRequests: rows.filter(r => r.status === 'pending' && r.date_from >= ys && r.date_from <= ye).length,
    sickDays: sick.reduce((s, r) => s + clipDays(r, ys, ye), 0),
    sickRequests: sick.length,
  }
}

// ── Breaks ─────────────────────────────────────────────────────────────

// Approved break-type leave, merged where requests touch or overlap, kept
// when the merged run covers BREAK_MIN_DAYS or more calendar days.
export function breakRanges(requests, types = BREAK_LEAVE_TYPES, minDays = BREAK_MIN_DAYS) {
  const rows = (requests || [])
    .filter(r => r.status === 'approved' && types.includes(r.leave_type))
    .map(r => ({ from: r.date_from, to: r.date_to }))
    .sort((a, b) => a.from.localeCompare(b.from))
  const merged = []
  for (const r of rows) {
    const last = merged[merged.length - 1]
    if (last && r.from <= addDays(last.to, 1)) {
      if (r.to > last.to) last.to = r.to
    } else {
      merged.push({ ...r })
    }
  }
  return merged
    .map(r => ({ ...r, days: datesInRange(r.from, r.to).length }))
    .filter(r => r.days >= minDays)
}

// last:    the most recent break begun on or before the reference day
//          (today, or 31 December when looking at a past year), with the
//          days since it ended. Looks back before the displayed year.
// next:    the first break booked after today.
// longestStretch: the longest run of days without a break inside the
//          displayed year, up to today.
// `last` null with `noneThisYear` true means no break at all on record:
// "None since joining".
export function breakSummary(requests, year, today, { startDate = null } = {}) {
  const ranges = breakRanges(requests)
  const ys = yearStart(year)
  const ye = yearEnd(year)
  const ref = today > ye ? ye : today

  const before = ranges.filter(r => r.from <= ref)
  const lastRange = before[before.length - 1] || null
  const last = lastRange && {
    ...lastRange,
    ongoing: lastRange.to >= ref,
    daysAgo: Math.max(0, daysBetween(lastRange.to, ref)),
  }

  const nextRange = ranges.find(r => r.from > today) || null
  const next = nextRange && { ...nextRange, daysAway: daysBetween(today, nextRange.from) }

  const windowFrom = startDate && startDate > ys ? startDate : ys
  const windowTo = ref
  let longestStretch = 0
  if (windowFrom <= windowTo && windowTo >= ys) {
    let cursor = windowFrom
    for (const r of ranges) {
      if (r.to < windowFrom || r.from > windowTo) continue
      if (r.from > cursor) longestStretch = Math.max(longestStretch, daysBetween(cursor, r.from))
      const after = addDays(r.to, 1)
      if (after > cursor) cursor = after
    }
    if (cursor <= windowTo) longestStretch = Math.max(longestStretch, daysBetween(cursor, windowTo) + 1)
  }

  return {
    last,
    next,
    longestStretch,
    breakThisYear: Boolean(last && last.to >= ys),
    noneSinceJoining: !last,
  }
}

// ── Days in lieu ───────────────────────────────────────────────────────

// [[from, to]] for every approved request — a shift held over approved
// leave was not worked (the rule Hours Summary applies to hours).
export function approvedLeaveRanges(requests) {
  return (requests || []).filter(r => r.status === 'approved').map(r => [r.date_from, r.date_to])
}

function onLeave(date, ranges) {
  return (ranges || []).some(([from, to]) => date >= from && date <= to)
}

const entryDate = e => (e.date || '').slice(0, 10)

// One row per public holiday shift this person worked: 1 day in lieu each.
//   entries   roster rows from published or archived rosters only
//   holidays  Map of 'YYYY-MM-DD' -> holiday name
// Not earned: a struck-through (vacated) doctor — the row no longer carries
// their profile_id; a locum shift (is_locum), even when a permanent doctor
// works it; a shift held over approved leave. With `countNightBefore`, a
// night shift dated the day before a public holiday earns one too.
export function lieuEarnedRows(entries, holidays, { profileId, leaveRanges = [], countNightBefore = false } = {}) {
  const rows = []
  for (const e of entries || []) {
    if (!e.profile_id || e.profile_id !== profileId || e.is_locum) continue
    const date = entryDate(e)
    if (onLeave(date, leaveRanges)) continue
    const base = { entryId: e.id, rosterMonthId: e.roster_month_id, date, shiftCode: e.shift_types?.code ?? null, shiftType: e.shift_types ?? null }
    if (holidays.has(date)) {
      rows.push({ ...base, holidayDate: date, holidayName: holidays.get(date), nightBefore: false })
    } else if (countNightBefore && e.shift_types?.is_night_shift && holidays.has(addDays(date, 1))) {
      const next = addDays(date, 1)
      rows.push({ ...base, holidayDate: next, holidayName: holidays.get(next), nightBefore: true })
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

// Approved time off in lieu, in calendar days.
export function lieuTakenDays(requests, from = '0000-01-01', to = '9999-12-31') {
  return (requests || [])
    .filter(r => r.status === 'approved' && r.leave_type === LIEU_LEAVE_TYPE)
    .reduce((s, r) => s + clipDays(r, from, to), 0)
}

// The running balance, across all time: owed = earned - taken, never below 0.
export function lieuBalance(entries, holidays, requests, { profileId, countNightBefore = false } = {}) {
  const rows = lieuEarnedRows(entries, holidays, { profileId, leaveRanges: approvedLeaveRanges(requests), countNightBefore })
  const taken = lieuTakenDays(requests)
  return { rows, earned: rows.length, taken, owed: Math.max(0, rows.length - taken) }
}

// The same balance for everyone at once (Hours Summary): { [profileId]:
// { earned, taken, owed } }. `requests` is every approved request for the
// people in `entries`.
export function lieuBalancesByProfile(entries, holidays, requests, { countNightBefore = false } = {}) {
  const entriesBy = new Map()
  for (const e of entries || []) {
    if (!e.profile_id) continue
    if (!entriesBy.has(e.profile_id)) entriesBy.set(e.profile_id, [])
    entriesBy.get(e.profile_id).push(e)
  }
  const requestsBy = new Map()
  for (const r of requests || []) {
    if (!requestsBy.has(r.profile_id)) requestsBy.set(r.profile_id, [])
    requestsBy.get(r.profile_id).push(r)
  }
  const out = {}
  for (const profileId of new Set([...entriesBy.keys(), ...requestsBy.keys()])) {
    const { earned, taken, owed } = lieuBalance(entriesBy.get(profileId) || [], holidays, requestsBy.get(profileId) || [], { profileId, countNightBefore })
    out[profileId] = { earned, taken, owed }
  }
  return out
}

// ── Shifts worked ──────────────────────────────────────────────────────

export const SHIFT_GROUPS = [
  { key: 'wd08', label: '08h00' },
  { key: 'wd12', label: '12h00' },
  { key: 'wd15', label: '15h00' },
  { key: 'wd22', label: '22h00 night' },
  { key: 'weDay', label: 'Weekend day' },
  { key: 'weNight', label: 'Weekend night' },
]

// From the shift type's own fields (day_type, is_night_shift, start_time),
// never its code. Weekend and public holiday shifts count together.
export function shiftGroupOf(shiftType) {
  if (!shiftType) return null
  if (shiftType.day_type !== 'weekday') return shiftType.is_night_shift ? 'weNight' : 'weDay'
  if (shiftType.is_night_shift) return 'wd22'
  const hour = Number(String(shiftType.start_time || '').slice(0, 2))
  if (hour < 10) return 'wd08'
  if (hour < 14) return 'wd12'
  return 'wd15'
}

// Shifts this person worked in `year`, by group. A shift held over
// approved leave was not worked; a shift that does not count toward
// contract hours (a locum shift) is left out, as on Hours Summary.
export function shiftCounts(entries, { profileId, year, leaveRanges = [] } = {}) {
  const counts = Object.fromEntries(SHIFT_GROUPS.map(g => [g.key, 0]))
  let total = 0
  for (const e of entries || []) {
    if (e.profile_id !== profileId || e.counts_toward_contract_hours === false) continue
    const date = entryDate(e)
    if (date < yearStart(year) || date > yearEnd(year) || onLeave(date, leaveRanges)) continue
    const group = shiftGroupOf(e.shift_types)
    if (!group) continue
    counts[group] += 1
    total += 1
  }
  return { counts, total }
}

// Days a consultant appears on the roster. Consultant rostering proper is a
// later phase; until then these days read "On call".
export function onCallDates(entries, profileId, year) {
  const dates = new Set()
  for (const e of entries || []) {
    const date = entryDate(e)
    if (e.consultant_profile_id === profileId && date >= yearStart(year) && date <= yearEnd(year)) dates.add(date)
  }
  return [...dates].sort()
}

// ── Leave record ───────────────────────────────────────────────────────

// Every request touching the year (any status), newest first.
export function leaveRecord(requests, year) {
  return (requests || [])
    .filter(r => !NOT_LEAVE_TYPES.has(r.leave_type) && touches(r, yearStart(year), yearEnd(year)))
    .sort((a, b) => b.date_from.localeCompare(a.date_from) || b.date_to.localeCompare(a.date_to))
}

export function leaveRecordCounts(rows) {
  const counts = { all: rows.length, annual: 0, sick: 0, other: 0 }
  for (const r of rows) counts[leaveBucket(r.leave_type)] += 1
  return counts
}

// Who is on a shift this person came off, or still holds while on leave.
//   not_covered  nobody: still on it (struck through), or no cover wanted
//   open_locum   an open locum slot
//   locum        a named locum
//   colleague    another doctor
export function coverKind(entry, profileId) {
  if (entry.profile_id === profileId && !entry.vacated_profile_id) return 'not_covered'
  if (entry.profile_id) return entry.is_locum ? 'locum' : 'colleague'
  if (entry.is_locum) return String(entry.locum_name || '').trim() || entry.locum_contact_id ? 'locum' : 'open_locum'
  return 'not_covered'
}

export const COVER_TEXT = {
  not_covered: 'not covered',
  open_locum: 'open locum slot',
  locum: 'locum',
  colleague: 'covered by a colleague',
}

// The shifts a leave request took this person off, each with its cover.
//   entries          this person's roster rows (held or vacated)
//   publishedMonths  Set of 'YYYY-MM' with a published or archived roster
// kind: 'shifts' | 'off_roster' (rostered period, no shift on those days)
//     | 'not_rostered' (no published roster for those dates yet)
export function coverForRequest(request, entries, { profileId, publishedMonths = new Set(), today } = {}) {
  const shifts = []
  for (const e of entries || []) {
    const date = entryDate(e)
    const linked = e.vacated_leave_request_id === request.id
    const inRange = date >= request.date_from && date <= request.date_to
    const vacatedHere = e.vacated_profile_id === profileId && inRange && !e.vacated_leave_request_id
    const stillHolds = e.profile_id === profileId && !e.vacated_profile_id && inRange && request.status === 'approved'
    if (!linked && !vacatedHere && !stillHolds) continue
    shifts.push({
      entryId: e.id,
      rosterMonthId: e.roster_month_id,
      date,
      shiftCode: e.shift_types?.code ?? null,
      startLabel: shiftStartLabel(e.start_time_override || e.shift_types?.start_time),
      cover: coverKind(e, profileId),
      coverProfileId: e.profile_id && e.profile_id !== profileId ? e.profile_id : null,
      locumName: e.is_locum ? (String(e.locum_name || '').trim() || null) : null,
    })
  }
  shifts.sort((a, b) => a.date.localeCompare(b.date))
  if (shifts.length > 0) return { kind: 'shifts', shifts }

  const months = new Set(datesInRange(request.date_from, request.date_to).map(d => d.slice(0, 7)))
  const rostered = [...months].some(m => publishedMonths.has(m))
  if (!rostered && today && request.date_to >= today) return { kind: 'not_rostered', shifts }
  return { kind: 'off_roster', shifts }
}

// "08h00 · not covered" / "2 shifts · 1 not covered" / "Off roster".
export function coverSummary(cover) {
  if (cover.kind === 'not_rostered') return 'Not yet rostered'
  if (cover.kind === 'off_roster') return 'Off roster'
  if (cover.shifts.length === 1) {
    const s = cover.shifts[0]
    return `${s.startLabel} · ${COVER_TEXT[s.cover]}`
  }
  const open = cover.shifts.filter(s => s.cover === 'not_covered' || s.cover === 'open_locum').length
  return `${cover.shifts.length} shifts · ${open === 0 ? 'all covered' : `${open} not covered`}`
}

// ── Year at a glance ───────────────────────────────────────────────────

// Every day of the year: { date, weekend, holidayName, leave, shift, onCall,
// late }. `leave` is the approved request covering the day (annual first
// when two overlap); `shift` the roster row this person holds or came off.
export function buildYearDays(year, { requests = [], holidays = new Map(), entries = [], profileId, lateDates = new Set() } = {}) {
  const counted = requests.filter(isCountedLeave)
    .sort((a, b) => (a.leave_type === 'annual' ? 0 : 1) - (b.leave_type === 'annual' ? 0 : 1))
  const shiftByDate = new Map()
  const onCall = new Set()
  for (const e of entries) {
    const date = entryDate(e)
    if (e.consultant_profile_id === profileId) onCall.add(date)
    if (e.profile_id === profileId || e.vacated_profile_id === profileId) {
      // A shift still held wins over one they came off the same day.
      if (!shiftByDate.has(date) || e.profile_id === profileId) shiftByDate.set(date, e)
    }
  }
  return datesInRange(yearStart(year), yearEnd(year)).map(date => {
    const dow = dayOfWeek(date)
    const leave = counted.find(r => date >= r.date_from && date <= r.date_to) || null
    return {
      date,
      weekend: dow === 0 || dow === 6,
      holidayName: holidays.get(date) || null,
      leave,
      leaveGroup: leave ? leaveTypeGroupKey(leave.leave_type) : null,
      shift: shiftByDate.get(date) || null,
      onCall: onCall.has(date),
      late: lateDates.has(date),
    }
  })
}

// The same days as week columns, rows Monday to Sunday; null pads the
// first and last week. Each column carries the month it starts, for the
// labels along the top.
export function yearWeekColumns(days) {
  const columns = []
  let column = null
  for (const day of days) {
    const row = (dayOfWeek(day.date) + 6) % 7 // Mon = 0
    if (!column || row === 0) {
      column = Array(7).fill(null)
      columns.push(column)
    }
    column[row] = day
  }
  return columns
}

export function daysByMonth(days) {
  const months = Array.from({ length: 12 }, () => [])
  for (const day of days) months[Number(day.date.slice(5, 7)) - 1].push(day)
  return months
}
