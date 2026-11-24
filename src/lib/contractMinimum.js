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
// 3. Days the doctor isn't available are taken off pro rata, the way the
//    engine scales its floor: approved leave; for interns and registrars
//    with rotations, days no rotation covers; days before ec_start_date;
//    days after scheduled_inactive_date. A day counts once.
//
// The engine also counts calendar blocks as unavailable. That table is
// empty and only its owner can read it, so it isn't read here.

export const ENGINE_FLOOR = 210
export const ENGINE_CONTRACT = 220
const EC_ROTATION_MIN = 220

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

// Distinct days in [monthStart, monthEnd] covered by any of `ranges`
// ({ date_from, date_to }).
export function unavailableDaysInMonth(ranges, monthStart, monthEnd) {
  const days = new Set()
  for (const r of ranges || []) addRange(days, r.date_from, r.date_to, monthStart, monthEnd)
  return days.size
}

export function leaveAdjustedMinimum(minHours, unavailableDays, daysInMonth) {
  const min = Number(minHours)
  if (!min) return 0
  if (!unavailableDays || !daysInMonth) return min
  const fraction = Math.max(0, daysInMonth - unavailableDays) / daysInMonth
  return Math.max(0, roundHalfEven(min * fraction))
}

// Pure. `profile` needs id, category, min_hours, ec_start_date and
// scheduled_inactive_date; `leave` its approved leave ({ date_from,
// date_to }) and `rotations` its intern_rotations rows.
export function monthMinimum({ profile, leave = [], rotations = [], monthStart, monthEnd }) {
  const daysInMonth = Number(monthEnd.slice(8, 10))
  const away = new Set()
  for (const l of leave) addRange(away, l.date_from, l.date_to, monthStart, monthEnd)

  let base = Number(profile.min_hours) || 0
  const usesRotations = ROTATION_PLANNED_CATEGORIES.has(profile.category) && rotations.length > 0
  let notInEc = 0
  if (usesRotations) {
    const covered = new Set()
    for (const r of rotations) addRange(covered, r.start_date, r.end_date || monthEnd, monthStart, monthEnd)
    for (const d of datesInRange(monthStart, monthEnd)) {
      if (!covered.has(d)) { away.add(d); notInEc++ }
    }
    const atStart = rotations
      .filter(r => r.start_date <= monthStart && (!r.end_date || r.end_date >= monthStart))
      .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
    if (atStart) base = atStart.rotation_type === 'OT' ? OT_HOURS.min : EC_ROTATION_MIN
  }
  const before = new Set(); const after = new Set()
  if (profile.ec_start_date && profile.ec_start_date > monthStart) {
    addRange(before, monthStart, prevDay(profile.ec_start_date), monthStart, monthEnd)
  }
  if (profile.scheduled_inactive_date && profile.scheduled_inactive_date < monthEnd) {
    addRange(after, nextDay(profile.scheduled_inactive_date), monthEnd, monthStart, monthEnd)
  }
  for (const d of [...before, ...after]) { if (!away.has(d)) notInEc++; away.add(d) }

  const floorBase = roundHalfEven(base * ENGINE_FLOOR / ENGINE_CONTRACT)
  return {
    contracted: base,
    minimum: leaveAdjustedMinimum(floorBase, away.size, daysInMonth),
    awayDays: away.size,
    notInEcDays: notInEc,
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
export const MINIMUM_PROFILE_FIELDS = 'id, category, min_hours, ec_start_date, scheduled_inactive_date'
