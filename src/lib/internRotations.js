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

// The only profiles.category value that needs a rotation lookup at all —
// see leaveYearGrid.js's LEAVE_CAPACITY_COLUMNS: every other category
// (including the forward-looking EC_COSMO_Intern/OT_COSMO_Intern values
// reserved for a separate, not-yet-built EC/OT distinction popup — keep
// this compatible with that, don't conflate the two) already resolves to a
// fixed column on its own, with no date dependency.
export const INTERN_ROTATION_CATEGORY = 'Intern'

const COLUMN_BY_ROTATION_TYPE = { EC: 'EC_COSMO', OT: 'OT_COSMO' }

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
export function resolveLeaveCapacityColumn({ category, profileId, date, rotationsByDoctorId }) {
  try {
    if (category !== INTERN_ROTATION_CATEGORY) return columnForLeaveCategory(category)
    const rotations = rotationsByDoctorId?.get ? rotationsByDoctorId.get(profileId) : rotationsByDoctorId?.[profileId]
    const rotation = rotationForDate(rotations, date)
    if (!rotation) return columnForLeaveCategory(category) // no rotation assigned yet — safe default, same as today
    return COLUMN_BY_ROTATION_TYPE[rotation.rotation_type] ?? columnForLeaveCategory(category)
  } catch {
    return columnForLeaveCategory(category)
  }
}

// The rotation block covering `date`, or null if none is assigned yet (or
// `rotations` itself is missing) — shared by resolveLeaveCapacityColumn and
// LeaveRequestForm's own date-driven lookup (resolving off the START of the
// requested range, not the login date).
export function rotationForDate(rotations, date) {
  if (!rotations || !date) return null
  return rotations.find(r => r.start_date <= date && date <= r.end_date) ?? null
}

// True if [dateFrom, dateTo] extends past the end of the rotation covering
// dateFrom — the boundary case a leave request spanning two rotation
// blocks needs to surface as an inline note. The whole request still gets
// tagged with just the dateFrom rotation's column (never split
// day-by-day); this only flags it for display.
export function straddlesRotationBoundary(rotations, dateFrom, dateTo) {
  const current = rotationForDate(rotations, dateFrom)
  return Boolean(current) && dateTo > current.end_date
}

// The inline note LeaveRequestForm shows when a requested range straddles
// a rotation boundary — null when it doesn't (or there's no current
// rotation to straddle from). The request itself still gets tagged with
// just the dateFrom rotation's column (see resolveLeaveCapacityColumn) —
// this is display-only, informing the requester their dates run past the
// rotation their pool is being counted against.
export function rotationBoundaryNote(rotations, dateFrom, dateTo) {
  const current = rotationForDate(rotations, dateFrom)
  if (!current || dateTo <= current.end_date) return null
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
    .select('id, doctor_id, rotation_type, start_date, end_date')
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
    .select('id, doctor_id, rotation_type, start_date, end_date')
    .order('start_date', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function createInternRotation({ doctorId, rotationType, startDate, endDate, createdBy }) {
  const { error } = await supabase.from('intern_rotations').insert({
    doctor_id: doctorId, rotation_type: rotationType, start_date: startDate, end_date: endDate, created_by: createdBy,
  })
  if (error) throw new Error(error.message)
}

export async function updateInternRotation(id, { doctorId, rotationType, startDate, endDate }) {
  const { error } = await supabase.from('intern_rotations')
    .update({ doctor_id: doctorId, rotation_type: rotationType, start_date: startDate, end_date: endDate })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteInternRotation(id) {
  const { error } = await supabase.from('intern_rotations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
