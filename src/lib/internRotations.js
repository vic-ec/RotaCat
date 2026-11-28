// intern_rotations: which EC-Cosmo sub-pool (EC / OT) an Intern belongs to
// is date-driven, not a static profiles.category value the way every other
// category is — interns rotate through ~1-2 month blocks across a 4-month
// placement. resolveLeaveCapacityColumn below is the single place that
// answers "which capacity column does this leave request's doctor actually
// belong to, given the dates being requested" — consumed by both
// LeaveRequestForm's own display and every capacity-counting call site (see
// leaveRequests.js's checkAnnualLeaveCapacity/fetchAnnualCapacityPreview),
// so a rotation swap can never leave one of those readings out of sync with
// the other.
import { supabase } from './supabase'
import { columnForLeaveCategory } from './leaveYearGrid'
import { todayStr, addDays } from './dateRange'
import { defaultHoursForCategory, rotationTypeKey } from './staffDefaults'

// Doctor categories whose EC/OT status is tracked as a rotation timeline
// rather than a fixed profiles field — mirrors categoryNeedsContractChoice's
// AMBIGUOUS_CATEGORIES in staffDefaults.js. COSMO was retired as a separate
// staff_category in Aug 2026 and folded into Intern, so Intern is the only
// rotation-tracked category now.
const ROTATION_TRACKED_CATEGORIES = new Set(['Intern'])

// The only profiles.category value that needs a rotation lookup at all —
// see leaveYearGrid.js's LEAVE_CAPACITY_COLUMNS: every other category
// (including the forward-looking EC_Intern/OT_Intern values reserved for a
// separate, not-yet-built EC/OT distinction popup — keep this compatible
// with that, don't conflate the two) already resolves to a fixed column on
// its own, with no date dependency.
export const INTERN_ROTATION_CATEGORY = 'Intern'

const COLUMN_BY_ROTATION_TYPE = { EC: 'EC_Intern', OT: 'OT_Intern' }

// The shared resolver behind every "which capacity column does this
// doctor's leave belong to" decision in the app, from LeaveRequestForm's
// own live preview down to the hard submission-time cap check
// (checkAnnualLeaveCapacity, run for every doctor, not just interns) — so
// this must never throw and must never change the answer for a non-intern
// category. `date` is the resolution date (per request: the requested
// range's own date_from, never the day it's being evaluated on, and never
// split day-by-day across a range that straddles two rotations).
// `rotationsByDoctorId` is a Map<doctorId, rotation[]> (see
// groupRotationsByDoctorId) or a plain { [doctorId]: rotation[] } object —
// both are accepted since some callers build the map fresh per fetch and
// others thread through props.
export function resolveLeaveCapacityColumn({ category, contractType, profileId, date, rotationsByDoctorId }) {
  try {
    if (category !== INTERN_ROTATION_CATEGORY) return columnForLeaveCategory(category, contractType)
    const rotations = rotationsByDoctorId?.get ? rotationsByDoctorId.get(profileId) : rotationsByDoctorId?.[profileId]
    const rotation = rotationForDate(rotations, date)
    if (!rotation) return columnForLeaveCategory(category, contractType) // no rotation assigned yet — safe default, same as today
    return COLUMN_BY_ROTATION_TYPE[rotation.rotation_type] ?? columnForLeaveCategory(category, contractType)
  } catch {
    return columnForLeaveCategory(category, contractType)
  }
}

// The rotation block covering `date`, or null if none is assigned yet (or
// `rotations` itself is missing) — shared by resolveLeaveCapacityColumn and
// LeaveRequestForm's own date-driven lookup (resolving off the START of the
// requested range, not the login date).
export function rotationForDate(rotations, date) {
  if (!rotations || !date) return null
  // null end_date = current/ongoing, no scheduled end yet — matches any
  // date on or after start_date, not "before every date" (a naive
  // `date <= r.end_date` would treat null as smaller than any string).
  return rotations.find(r => r.start_date <= date && (r.end_date === null || date <= r.end_date)) ?? null
}

// True if the rotation block [start_date, end_date] overlaps this calendar
// month at all (not just fully contains it) — a rotation starting
// mid-month, or ending mid-month, still counts for that month. Shared by
// the Intern Rotations Matrix (InternRotationsMatrix.jsx) to decide which
// month cells a doctor's rotation bar covers. null end_date = current/
// ongoing, treated as extending past every month, not as "before
// monthStart".
export function rotationTouchesMonth(rotation, year, month) {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-31` // string comparison is safe here — YYYY-MM-DD sorts lexically, and no real date exceeds 31
  return rotation.start_date <= monthEnd && (rotation.end_date === null || rotation.end_date >= monthStart)
}

// One typeKey per month (1-12) for a doctor's rotations in the displayed
// year, or null for a genuine gap — gaps are real (an intern can be
// between their EC block and their next OT placement) and the Rotations
// page's month cells (RotationSequenceRow.jsx) must show them empty
// rather than filled or collapsed. A real data overlap (two rotations
// touching the same month) is tie-broken by latest start_date; the same
// cell this produces is what the panel's overlap warning is about, so
// which one "wins" here is cosmetic, not a second source of truth.
export function monthlyTypeKeys(doctorRotations, year) {
  const keys = []
  for (let month = 1; month <= 12; month++) {
    const touching = (doctorRotations || []).filter(r => rotationTouchesMonth(r, year, month))
    if (touching.length === 0) { keys.push(null); continue }
    const winner = [...touching].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
    keys.push(rotationTypeKey(winner.rotation_type, winner.subtype))
  }
  return keys
}

// True if [dateFrom, dateTo] extends past the end of the rotation covering
// dateFrom — the boundary case a leave request spanning two rotation
// blocks needs to surface as an inline note. The whole request still gets
// tagged with just the dateFrom rotation's column (never split
// day-by-day); this only flags it for display.
export function straddlesRotationBoundary(rotations, dateFrom, dateTo) {
  const current = rotationForDate(rotations, dateFrom)
  return Boolean(current) && current.end_date !== null && dateTo > current.end_date
}

// The inline note LeaveRequestForm shows when a requested range straddles
// a rotation boundary — null when it doesn't (or there's no current
// rotation to straddle from). The request itself still gets tagged with
// just the dateFrom rotation's column (see resolveLeaveCapacityColumn) —
// this is display-only, informing the requester their dates run past the
// rotation their pool is being counted against.
export function rotationBoundaryNote(rotations, dateFrom, dateTo) {
  const current = rotationForDate(rotations, dateFrom)
  if (!current || current.end_date === null || dateTo <= current.end_date) return null
  const next = (rotations || [])
    .filter(r => r.start_date > current.end_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  return next
    ? `This range extends past your current rotation (through ${current.end_date}) into your next rotation, which starts ${next.start_date}. It's still counted against your current rotation's pool for the whole range.`
    : `This range extends past your current rotation (through ${current.end_date}) — no rotation is assigned yet beyond that date. It's still counted against your current rotation's pool for the whole range.`
}

// Groups raw intern_rotations rows by doctor_id — the shape
// resolveLeaveCapacityColumn's rotationsByDoctorId expects everywhere it's
// threaded through props, mirroring publicHolidaysByDate's fetch-once,
// pass-down pattern.
export function groupRotationsByDoctorId(rotations) {
  const byDoctorId = new Map()
  for (const r of (rotations || [])) {
    if (!byDoctorId.has(r.doctor_id)) byDoctorId.set(r.doctor_id, [])
    byDoctorId.get(r.doctor_id).push(r)
  }
  return byDoctorId
}

// Fetches every intern_rotations row for the given doctor ids — callers
// pass just the doctor_ids actually present in whatever leave_requests
// query they're bucketing, rather than pulling the whole table on every
// call. Always a live query, never cached, so an admin's last-minute
// rotation swap is reflected immediately everywhere this feeds into.
export async function fetchInternRotationsForDoctorIds(doctorIds) {
  const ids = [...new Set((doctorIds || []).filter(Boolean))]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('intern_rotations')
    .select('id, doctor_id, rotation_type, subtype, start_date, end_date')
    .in('doctor_id', ids)
  if (error) throw new Error(error.message)
  return data || []
}

// Every intern_rotations row, for the admin table/timeline views — those
// need every intern's rotations regardless of who currently has a
// leave_requests row on record, unlike fetchInternRotationsForDoctorIds'
// narrower per-query scope.
export async function fetchAllInternRotations() {
  const { data, error } = await supabase
    .from('intern_rotations')
    .select('id, doctor_id, rotation_type, subtype, start_date, end_date')
    .order('start_date', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function createInternRotation({ doctorId, rotationType, subtype, startDate, endDate, createdBy }) {
  const { error } = await supabase.from('intern_rotations').insert({
    doctor_id: doctorId, rotation_type: rotationType, subtype: rotationType === 'OT' ? (subtype || null) : null,
    start_date: startDate, end_date: endDate, created_by: createdBy,
  })
  if (error) throw new Error(error.message)
  await syncProfileFromCurrentRotation(doctorId)
}

export async function updateInternRotation(id, { doctorId, rotationType, subtype, startDate, endDate }) {
  const { error } = await supabase.from('intern_rotations')
    .update({
      doctor_id: doctorId, rotation_type: rotationType, subtype: rotationType === 'OT' ? (subtype || null) : null,
      start_date: startDate, end_date: endDate,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await syncProfileFromCurrentRotation(doctorId)
}

export async function deleteInternRotation(id, doctorId) {
  const { error } = await supabase.from('intern_rotations').delete().eq('id', id)
  if (error) throw new Error(error.message)
  if (doctorId) await syncProfileFromCurrentRotation(doctorId)
}

// The single place that resolves "what is this doctor's rotation right
// now" and pushes it onto profiles.contract_type/psych_subcategory/
// min_hours/max_hours — called after every intern_rotations write
// (create/update/delete above) so Staff List and Accounts never need to
// join intern_rotations just to show current status. min_hours/max_hours
// matter here, not just contract_type/psych_subcategory: the scheduling
// backend treats them as the doctor's real hard hour bounds
// (RosterSolver, e.g. add_hours_bounds) — leaving EC's ~220-246h on a
// doctor whose contract_type just flipped to OT would have the solver
// scheduling them against the wrong band entirely. Deliberately does
// nothing if no rotation covers today (e.g. a gap between blocks, or the
// doctor's very first block is still in the future) — it never blanks
// out a doctor's last-known status just because the planner has a hole
// in it right now.
//
// Known limitation (no DB trigger, no daily cron): a future-dated block
// planned weeks ahead only "activates" here if something writes to
// intern_rotations that day. Roster generation itself does not depend on
// this cache — the scheduling backend resolves the target month directly
// against intern_rotations (see RotaCatScheduler's loader.py) — so this
// only affects how fresh the Staff List/Accounts display (and these
// cached hour bounds) are between edits.
export async function syncProfileFromCurrentRotation(doctorId) {
  const today = todayStr()
  const [{ data, error }, { data: profileRow, error: profileFetchError }] = await Promise.all([
    supabase
      .from('intern_rotations')
      .select('rotation_type, subtype')
      .eq('doctor_id', doctorId)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('profiles').select('category').eq('id', doctorId).single(),
  ])
  if (error) throw new Error(error.message)
  if (!data) return
  if (profileFetchError) throw new Error(profileFetchError.message)

  const contractType = data.rotation_type === 'OT' ? 'Junior_Doctor_Overtime' : 'full'
  const psychSubcategory = data.rotation_type === 'OT' ? (data.subtype || null) : null
  const hours = defaultHoursForCategory(profileRow.category, contractType)
  const { error: profileError } = await supabase.from('profiles')
    .update({
      contract_type: contractType, psych_subcategory: psychSubcategory,
      min_hours: hours.min, max_hours: hours.max,
    })
    .eq('id', doctorId)
  if (profileError) throw new Error(profileError.message)
}

// Applies an EC/OT (+ subtype) change for one doctor — the single write
// path shared by AccountSettingsPage's admin edit and StaffListPage's
// approval of a self-service 'hours' request. For a rotation-tracked
// category (Intern) this writes into intern_rotations (closing out
// whatever's currently open, then opening a new current block from today)
// so the Intern Rotations Planner immediately reflects the change — an
// Accounts-page edit "feeds" the planner, same as the planner feeds
// Accounts; syncProfileFromCurrentRotation (called by createInternRotation
// below) is what then pushes contract_type/psych_subcategory/min_hours/
// max_hours onto profiles. Any other category has no rotation timeline to
// speak of, so it falls back to a direct profiles write, updating the
// same four fields itself.
export async function applyHoursChange({ profileId, category, contractType, subtype, actorId }) {
  if (!ROTATION_TRACKED_CATEGORIES.has(category)) {
    const hours = defaultHoursForCategory(category, contractType)
    const { error } = await supabase.from('profiles')
      .update({ contract_type: contractType, psych_subcategory: null, min_hours: hours.min, max_hours: hours.max })
      .eq('id', profileId)
    if (error) throw new Error(error.message)
    return
  }

  const rotationType = contractType === 'Junior_Doctor_Overtime' ? 'OT' : 'EC'
  const today = todayStr()

  const { data: current, error: fetchError } = await supabase
    .from('intern_rotations')
    .select('id, rotation_type, subtype, start_date')
    .eq('doctor_id', profileId)
    .is('end_date', null)
    .maybeSingle()
  if (fetchError) throw new Error(fetchError.message)

  if (current && current.rotation_type === rotationType && (current.subtype || null) === (subtype || null)) {
    return // already this — nothing to change
  }
  if (current) {
    if (current.start_date >= today) {
      // Started today (or, oddly, in the future) — nothing to truncate to,
      // just replace it outright rather than writing an end_date before
      // its own start_date (which the DB range check would reject).
      await deleteInternRotation(current.id, profileId)
    } else {
      await updateInternRotation(current.id, {
        doctorId: profileId, rotationType: current.rotation_type, subtype: current.subtype,
        startDate: current.start_date, endDate: addDays(today, -1),
      })
    }
  }
  await createInternRotation({
    doctorId: profileId, rotationType, subtype, startDate: today, endDate: null, createdBy: actorId,
  })
}

// Categories in scope for the end-of-rotation queue.
const END_OF_ROTATION_CATEGORIES = new Set(['Intern', 'Registrar'])

// A doctor belongs in the end-of-rotation queue when: their most
// recently-STARTING rotation block has a real (non-null) end_date; today
// is on or after the 1st of the calendar month that end_date falls in;
// nothing else already covers what comes next; and nobody's already
// scheduled a deactivation for them. Pure/read-time — no stored flag,
// fully re-derivable from profiles + intern_rotations on every read.
// Returns the flagged rotation block, or null if this doctor doesn't
// belong in the queue.
export function endOfRotationFlag({ category, scheduledInactiveDate, rotations }, today = todayStr()) {
  if (!END_OF_ROTATION_CATEGORIES.has(category)) return null
  if (scheduledInactiveDate) return null
  if (!rotations || rotations.length === 0) return null

  const sorted = [...rotations].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const lastRotation = sorted[sorted.length - 1]
  if (lastRotation.end_date === null) return null

  const monthStart = `${lastRotation.end_date.slice(0, 7)}-01`
  if (today < monthStart) return null

  const somethingCoversWhatsNext = rotations.some(r => r.start_date > lastRotation.end_date)
  if (somethingCoversWhatsNext) return null

  return lastRotation
}

// ── Rotation sequence rows (the Rotations page's Active/Upcoming/
// Completed tabs — see RotationSequenceRow.jsx) ────────────────────────
//
// A "block" is a run of a doctor's rotations with no gap between them —
// each one starts the very next day after the previous one ends. A block
// never continues past an open-ended (null end_date) rotation: nothing can
// start "the day after" a date that doesn't exist, so an open-ended
// rotation is always the last entry of its block. Returns blocks in
// start-date order, each `{ rotations, startDate, endDate }` (`endDate` is
// the block's own last rotation's end_date, so null means the block itself
// is still open).
export function groupRotationsIntoBlocks(rotations) {
  const sorted = [...(rotations || [])].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const blocks = []
  for (const rotation of sorted) {
    const current = blocks[blocks.length - 1]
    const last = current?.rotations[current.rotations.length - 1]
    if (current && last.end_date !== null && rotation.start_date === addDays(last.end_date, 1)) {
      current.rotations.push(rotation)
    } else {
      blocks.push({ rotations: [rotation] })
    }
  }
  return blocks.map(b => ({
    rotations: b.rotations,
    startDate: b.rotations[0].start_date,
    endDate: b.rotations[b.rotations.length - 1].end_date,
  }))
}

// Inclusive count of distinct calendar months a [startDate, endDate] range
// touches — "1 Nov to 31 Jan" is 3 (Nov, Dec, Jan), not a day count. Used
// for both "month 2 of 3" (a single-rotation block's position) and a
// completed doctor's total months on record.
export function monthSpan(startDate, endDate) {
  const [sy, sm] = startDate.slice(0, 7).split('-').map(Number)
  const [ey, em] = endDate.slice(0, 7).split('-').map(Number)
  return (ey * 12 + em) - (sy * 12 + sm) + 1
}

// The rotation covering `date`, tie-broken by latest start_date when two
// rows overlap — the same tie-break InternRotationsMatrix.jsx's own
// monthlyTypeKeys already uses for which colour a month cell shows, kept
// consistent here for which rotation a position line is built from.
// Deliberately separate from rotationForDate above (first-match, no
// tie-break) — that one feeds leave-capacity resolution, a different
// question this doesn't touch.
function currentRotation(rotations, date) {
  return rotations
    .filter(r => r.start_date <= date && (r.end_date === null || date <= r.end_date))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null
}

// The Active tab's per-doctor position, as the raw rotations/dates it's
// built from — RotationSequenceRow.jsx turns this into the chip + position
// line text (label/code lookups and date formatting are display concerns,
// kept out of this module). One of:
//   { situation: 'none' }                                     — nothing current, nothing scheduled
//   { situation: 'between-blocks', next }                     — nothing current, one scheduled later
//   { situation: 'ongoing', current }                         — current rotation has no end date
//   { situation: 'last-in-block', current }                   — current is the last rotation of a multi-rotation block
//   { situation: 'single', current, blockStart }              — current's block is just that one rotation
//   { situation: 'mid-block', current, next, blockEnd }       — current is followed by another rotation in the same block
export function activeRotationStatus(rotations, today = todayStr()) {
  const list = rotations || []
  const current = currentRotation(list, today)
  if (!current) {
    const next = list
      .filter(r => r.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    return next ? { situation: 'between-blocks', next } : { situation: 'none' }
  }
  if (current.end_date === null) return { situation: 'ongoing', current }

  const block = groupRotationsIntoBlocks(list).find(b => b.rotations.some(r => r.id === current.id))
  const index = block.rotations.findIndex(r => r.id === current.id)
  if (block.rotations.length === 1) return { situation: 'single', current, blockStart: block.startDate }
  if (index === block.rotations.length - 1) return { situation: 'last-in-block', current }
  return { situation: 'mid-block', current, next: block.rotations[index + 1], blockEnd: block.endDate }
}

// The Upcoming tab's per-doctor position — the doctor's first (earliest)
// block, since they haven't started yet. One of:
//   { situation: 'none' }
//   { situation: 'single', rotation }           — the first block is just one rotation
//   { situation: 'multi', rotations, blockEnd } — the first block has several, in order
export function upcomingRotationStatus(rotations) {
  const blocks = groupRotationsIntoBlocks(rotations || [])
  if (blocks.length === 0) return { situation: 'none' }
  const first = blocks[0]
  if (first.rotations.length === 1) return { situation: 'single', rotation: first.rotations[0] }
  return { situation: 'multi', rotations: first.rotations, blockEnd: first.endDate }
}

// The Completed tab's per-doctor position — totalled across every
// rotation on record, not just the displayed year. One of:
//   { situation: 'none' }
//   { situation: 'single-type', rotation, totalMonths } — exactly one block, itself a single rotation
//   { situation: 'multi-block', totalMonths, blockCount } — everything else (several blocks, or one block of several rotations)
export function completedRotationStatus(rotations) {
  const list = rotations || []
  const blocks = groupRotationsIntoBlocks(list)
  if (blocks.length === 0) return { situation: 'none' }
  const totalMonths = list.reduce((sum, r) => sum + monthSpan(r.start_date, r.end_date ?? r.start_date), 0)
  if (blocks.length === 1 && blocks[0].rotations.length === 1) {
    return { situation: 'single-type', rotation: blocks[0].rotations[0], totalMonths }
  }
  return { situation: 'multi-block', totalMonths, blockCount: blocks.length }
}

// The Rotations planner's sections (InternRotationsMatrix and
// RotationStatusTable). COSMO was retired as a separate staff_category in
// Aug 2026 (folded into Intern — see InternRotationsPlanner.jsx) so the
// doctor pool is only ever Intern/Registrar now. A doctor never moves
// section when their current rotation changes — their category decides
// it, once, same as the Staff list's own category grouping.
export const CATEGORY_GROUP_ORDER = ['Intern', 'Registrar']

// Which section a doctor sits in: their category when it is one of
// CATEGORY_GROUP_ORDER, else Intern.
export function categoryGroupKey(doctor) {
  return CATEGORY_GROUP_ORDER.includes(doctor.category) ? doctor.category : 'Intern'
}
