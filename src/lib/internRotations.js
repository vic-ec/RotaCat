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
import { defaultHoursForCategory } from './staffDefaults'

// Doctor categories whose EC/OT status is tracked as a rotation timeline
// rather than a fixed profiles field — mirrors categoryNeedsContractChoice's
// AMBIGUOUS_CATEGORIES in staffDefaults.js. Real intern_rotations rows
// already exist for both COSMO and Intern doctors (the OT/72h band is
// shared between them), so both are in scope here, not just Intern.
const ROTATION_TRACKED_CATEGORIES = new Set(['COSMO', 'Intern'])

// The only profiles.category value that needs a rotation lookup at all —
// see leaveYearGrid.js's LEAVE_CAPACITY_COLUMNS: every other category
// (including the forward-looking EC_COSMO_Intern/OT_COSMO_Intern values
// reserved for a separate, not-yet-built EC/OT distinction popup — keep
// this compatible with that, don't conflate the two) already resolves to a
// fixed column on its own, with no date dependency.
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
// category (COSMO/Intern) this writes into intern_rotations (closing out
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

// Categories in scope for the end-of-rotation queue — a COSMO's OT/subtype
// change is a move within the OT band, not an exit from the rotation
// system entirely, so COSMO stays out of scope here (unlike
// ROTATION_TRACKED_CATEGORIES above, which covers both).
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
