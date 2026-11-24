import { supabase } from './supabase'
import { datesInRange, monthBounds } from './dateRange'
import { OT_HOURS, ROTATION_PLANNED_CATEGORIES } from './staffDefaults'

// The minimum a doctor should be rostered for in one month — what the
// "under contracted hours" checks (Dashboard, Hours Summary) measure
// against. It follows the roster engine (RotaCatScheduler, solver.py):
//
// 1. Base: the contracted minimum. For an intern or registrar with a
//    rotation covering the 1st of the month, the rotation's band (EC 220,
//    OT 64), as the engine resolves it; otherwise profiles.min_hours.
// 2. Variance: lowered to the engine's own floor ratio — it holds a
//    220h full-time doctor to 210h — so a roster a shift or so short of
//    the exact contract (216/220) isn't flagged. Same share for every
//    contract (108 → 103, 64 → 61).
// 3. Leave is credited per shift missed, the way the paper roster's hours
//    sheet does it: each weekday (Mon–Fri) on approved leave is one shift
//    off the shifts the contract expects in a month — 20 full-time, 10 for
//    ⅝, 6 for OT/psych. Weekend days on leave don't count; a doctor works
//    one weekend day in two, and the paper doesn't count them either.
//    Barnes, 10 weekdays of leave: 210 × 10/20 = 105.
// 4. Days not in the EC at all — outside every rotation (interns and
//    registrars), before ec_start_date, after scheduled_inactive_date —
//    take off their share of the month's weekdays. A day counts once;
//    leave on a day not in the EC isn't counted again.
// The engine (solver.py) scales its floor the same way.
//
// The engine also counts calendar blocks as unavailable. That table is
// empty and only its owner can read it, so it isn't read here.

// Absences before this month were never recorded in the app — rosters up
// to October 2026 were rebuilt from paper, and their sick leave lived on
// scattered notes. Under-hours isn't judged for those months; over-hours
// still is, since a missing absence can't cause it.
export const HOURS_TRACKED_FROM = '2026-11-01'
export function isUnderHoursTracked(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01` >= HOURS_TRACKED_FROM
}
export function trackedFromLabel() {
  const [y, m] = HOURS_TRACKED_FROM.split('-').map(Number)
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`
}

export const ENGINE_FLOOR = 210
export const ENGINE_CONTRACT = 220
const EC_ROTATION_MIN = 220

// Shifts a month's contract expects, as on the paper roster's hours sheet.
export const EXPECTED_SHIFTS = { full: 20, five_eighths: 10, Junior_Doctor_Overtime: 6 }

function isWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return dow >= 1 && dow <= 5
}

// Python's round(): halves go to the even neighbour (round(2.5) === 2).
export function roundHalfEven(x) {
  const floor = Math.floor(x)
  const diff = x - floor
  if (Math.abs(diff - 0.5) > 1e-9) return Math.round(x)
  return floor % 2 === 0 ? floor : floor + 1
}

function addRange(days, from, to, monthStart, monthEnd) {
  const a = from && from > monthStart ? from : monthStart
  const b = to && to < monthEnd ? to : monthEnd
  if (a > b) return
  for (const d of datesInRange(a, b)) days.add(d)
}

// Pure. `profile` needs id, category, contract_type, min_hours,
// ec_start_date and scheduled_inactive_date; `leave` its approved leave
// ({ date_from, date_to }) and `rotations` its intern_rotations rows.
export function monthMinimum({ profile, leave = [], rotations = [], monthStart, monthEnd }) {
  const daysInMonth = Number(monthEnd.slice(8, 10))
  const monthDays = datesInRange(monthStart, monthEnd)

  // Days not in the EC.
  const notInEc = new Set()
  let base = Number(profile.min_hours) || 0
  let contract = profile.contract_type || 'full'
  if (ROTATION_PLANNED_CATEGORIES.has(profile.category) && rotations.length > 0) {
    const covered = new Set()
    for (const r of rotations) addRange(covered, r.start_date, r.end_date || monthEnd, monthStart, monthEnd)
    for (const d of monthDays) if (!covered.has(d)) notInEc.add(d)
    const atStart = rotations
      .filter(r => r.start_date <= monthStart && (!r.end_date || r.end_date >= monthStart))
      .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
    if (atStart) {
      const ot = atStart.rotation_type === 'OT'
      base = ot ? OT_HOURS.min : EC_ROTATION_MIN
      contract = ot ? 'Junior_Doctor_Overtime' : 'full'
    }
  }
  if (profile.ec_start_date && profile.ec_start_date > monthStart) {
    addRange(notInEc, monthStart, prevDay(profile.ec_start_date), monthStart, monthEnd)
  }
  if (profile.scheduled_inactive_date && profile.scheduled_inactive_date < monthEnd) {
    addRange(notInEc, nextDay(profile.scheduled_inactive_date), monthEnd, monthStart, monthEnd)
  }

  // Leave days, on days in the EC.
  const onLeave = new Set()
  for (const l of leave) addRange(onLeave, l.date_from, l.date_to, monthStart, monthEnd)
  for (const d of notInEc) onLeave.delete(d)

  const weekdays = monthDays.filter(isWeekday).length
  const notInEcWeekdays = [...notInEc].filter(isWeekday).length
  const leaveShifts = [...onLeave].filter(isWeekday).length
  const expected = EXPECTED_SHIFTS[contract] ?? EXPECTED_SHIFTS.full
  const expectedHere = weekdays ? expected * (weekdays - notInEcWeekdays) / weekdays : expected

  const floorBase = roundHalfEven(base * ENGINE_FLOOR / ENGINE_CONTRACT)
  const minimum = floorBase ? Math.max(0, roundHalfEven(floorBase * Math.max(0, expectedHere - leaveShifts) / expected)) : 0
  return {
    contracted: base,
    minimum,
    expectedShifts: expected,
    leaveShifts,
    leaveDays: onLeave.size,
    notInEcDays: notInEc.size,
    awayDays: onLeave.size + notInEc.size,
    daysInMonth,
  }
}

function shift(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}
const prevDay = d => shift(d, -1)
const nextDay = d => shift(d, 1)

// The reads monthMinimum needs, for many doctors at once. Returns
// Map profileId -> monthMinimum(...).
export async function fetchMonthMinimums({ profiles, year, month }) {
  const { start: monthStart, end: monthEnd } = monthBounds(year, month)
  const ids = profiles.map(p => p.id)
  if (ids.length === 0) return new Map()
  const [leaveRes, rotRes] = await Promise.all([
    supabase.from('leave_requests').select('profile_id, date_from, date_to')
      .eq('status', 'approved').lte('date_from', monthEnd).gte('date_to', monthStart),
    supabase.from('intern_rotations').select('doctor_id, rotation_type, start_date, end_date').in('doctor_id', ids),
  ])
  const group = (rows, key) => {
    const m = new Map()
    for (const r of rows || []) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r) }
    return m
  }
  const leaveBy = group(leaveRes.data, 'profile_id')
  const rotBy = group(rotRes.data, 'doctor_id')
  return new Map(profiles.map(p => [p.id, monthMinimum({
    profile: p, leave: leaveBy.get(p.id) || [], rotations: rotBy.get(p.id) || [], monthStart, monthEnd,
  })]))
}

// The fields a profile select needs for monthMinimum.
export const MINIMUM_PROFILE_FIELDS = 'id, category, contract_type, min_hours, ec_start_date, scheduled_inactive_date'
