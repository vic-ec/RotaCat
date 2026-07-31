// Leave-request submission — pure validation helpers (unit-testable without
// Supabase) plus the async submission flow that wires them together.
import { supabase } from './supabase'
import { addDays, datesInRange, rangesOverlap, dayOfWeek, parseLocalDate } from './dateRange'
import { overlapsPlannedWeekend } from './weekendPlanner'
import { LEAVE_CAPACITY_COLUMNS, columnForLeaveCategory, buildLeaveByDate, countByColumnPerDate, findLeaveCapacityBreach } from './leaveYearGrid'

export const LEAVE_TYPE_OPTIONS = [
  { value: 'annual', label: 'Annual leave' },
  { value: 'single_day', label: 'Single day' },
  { value: 'special_leave', label: 'Special leave' },
  { value: 'course', label: 'Course / CPD' },
  { value: 'sick', label: 'Sick leave' },
  { value: 'weekend_exception', label: 'Weekend exception' },
]

// weekend_exception must cover exactly one Saturday+Sunday pair.
export function isValidWeekendExceptionRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return false
  return dayOfWeek(dateFrom) === 6 // Saturday
    && dateTo === addDays(dateFrom, 1)
    && dayOfWeek(dateTo) === 0 // Sunday
}

// Sick leave may be backdated up to `backdateDays` days before today for a
// non-admin submitter. Anything not in the past isn't "backdated" at all.
export function isSickBackdateAllowed(dateFrom, todayStr, backdateDays) {
  if (dateFrom >= todayStr) return true
  const daysBack = Math.round((parseLocalDate(todayStr) - parseLocalDate(dateFrom)) / 86400000)
  return daysBack <= backdateDays
}

export function computeIncludesPublicHoliday(dateFrom, dateTo, publicHolidayDates) {
  const phSet = publicHolidayDates instanceof Set ? publicHolidayDates : new Set(publicHolidayDates)
  return datesInRange(dateFrom, dateTo).some(d => phSet.has(d))
}

export { overlapsPlannedWeekend as computeOverlapsRosteredWeekend }

// Tier-1 (block at submission): double-booking against existing
// pending/approved leave_requests and assigned roster_entries for the same
// profile/date range. Rejected/withdrawn leave never conflicts.
export function findDoubleBookingConflicts({ dateFrom, dateTo, existingLeaveRequests = [], rosterEntryDates = [] }) {
  const leaveConflicts = existingLeaveRequests.filter(lr =>
    (lr.status === 'pending' || lr.status === 'approved')
    && rangesOverlap(dateFrom, dateTo, lr.date_from, lr.date_to)
  )
  const rosterDateSet = new Set(rosterEntryDates)
  const rosterConflicts = datesInRange(dateFrom, dateTo).filter(d => rosterDateSet.has(d))
  return {
    hasConflict: leaveConflicts.length > 0 || rosterConflicts.length > 0,
    leaveConflicts,
    rosterConflicts,
  }
}

// Tier-1 (block at submission): the Annual Leave planner caps how many
// doctors from the same capacity column (MO / Registrar / OT COSMO+Intern)
// can be on leave at once — mirrors the physical Google Sheet's "only N
// doctors in this category allowed leave at a time" rule. Checked against
// every other pending or approved annual-leave request (rejected/withdrawn
// never count, same as the double-booking check above). No-op for any
// other leave type, or for a category with no capacity column (Other).
async function checkAnnualLeaveCapacity({ profileId, dateFrom, dateTo }) {
  const [profileRes, constraintsRes, overlappingRes] = await Promise.all([
    supabase.from('profiles').select('category').eq('id', profileId).single(),
    supabase.from('constraints').select('key, value').in('key', LEAVE_CAPACITY_COLUMNS.map(c => c.constraintKey)),
    supabase.from('leave_requests')
      .select('profile_id, date_from, date_to, profiles!leave_requests_profile_id_fkey(category)')
      .eq('leave_type', 'annual')
      .in('status', ['pending', 'approved'])
      .neq('profile_id', profileId)
      .lte('date_from', dateTo)
      .gte('date_to', dateFrom),
  ])

  const columnKey = columnForLeaveCategory(profileRes.data?.category)
  const columnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnKey)
  if (!columnDef) return // this doctor's category has no capacity cap (Other column)

  const maxByConstraintKey = Object.fromEntries((constraintsRes.data || []).map(c => [c.key, Number(c.value)]))
  const maxConcurrent = maxByConstraintKey[columnDef.constraintKey] ?? columnDef.defaultMax

  const byDate = buildLeaveByDate(overlappingRes.data || [], {
    yearFrom: Number(dateFrom.slice(0, 4)), yearTo: Number(dateTo.slice(0, 4)),
  })
  const countsByDate = countByColumnPerDate(byDate, e => e.profiles?.category)
  const { hasBreach, breachDates } = findLeaveCapacityBreach({ dateFrom, dateTo, columnKey, maxConcurrent, existingCountsByDate: countsByDate })
  if (hasBreach) {
    const plural = maxConcurrent === 1 ? 'doctor is' : 'doctors are'
    throw new Error(`Only ${maxConcurrent} ${columnDef.label} ${plural} allowed on leave at once, and that's already reached on ${breachDates[0]}. Adjust the dates and try again.`)
  }
}

function todayStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Full submission flow: fetches what's needed to validate, blocks on
// Tier-1 conflicts, computes the two derived flags, and inserts the row.
// Throws with a user-facing message on any Tier-1 rejection.
export async function submitLeaveRequest({ profileId, isAdmin, leaveType, dateFrom, dateTo, notes }) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    throw new Error('Please choose a valid date range.')
  }

  if (leaveType === 'weekend_exception' && !isValidWeekendExceptionRange(dateFrom, dateTo)) {
    throw new Error('A weekend exception must cover exactly one Saturday and the following Sunday.')
  }

  if (leaveType === 'sick' && !isAdmin) {
    const { data: settingRow } = await supabase
      .from('app_settings').select('value').eq('key', 'sick_leave_backdate_days').single()
    const backdateDays = Number(settingRow?.value ?? 0)
    if (!isSickBackdateAllowed(dateFrom, todayStr(), backdateDays)) {
      throw new Error(`Sick leave can only be backdated up to ${backdateDays} days. Contact an admin for older dates.`)
    }
  }

  if (leaveType === 'annual') {
    await checkAnnualLeaveCapacity({ profileId, dateFrom, dateTo })
  }

  // A weekend's Sunday can fall on dateFrom without its Saturday doing so,
  // so widen the lower bound by a day to still catch that planner entry.
  const [leaveRes, entriesRes, phRes, plannerRes] = await Promise.all([
    supabase.from('leave_requests').select('date_from, date_to, status').eq('profile_id', profileId),
    supabase.from('roster_entries').select('date').eq('profile_id', profileId).gte('date', dateFrom).lte('date', dateTo),
    supabase.from('public_holidays').select('date').gte('date', dateFrom).lte('date', dateTo),
    supabase.from('weekend_planner_entries').select('weekend_saturday').eq('profile_id', profileId)
      .gte('weekend_saturday', addDays(dateFrom, -1)).lte('weekend_saturday', dateTo),
  ])

  const { hasConflict, leaveConflicts, rosterConflicts } = findDoubleBookingConflicts({
    dateFrom,
    dateTo,
    existingLeaveRequests: leaveRes.data || [],
    rosterEntryDates: (entriesRes.data || []).map(e => e.date?.slice(0, 10)),
  })
  if (hasConflict) {
    const parts = []
    if (leaveConflicts.length) parts.push('an existing leave request')
    if (rosterConflicts.length) parts.push('a shift already on the roster')
    throw new Error(`This date range overlaps ${parts.join(' and ')}. Adjust the dates and try again.`)
  }

  const includesPublicHoliday = computeIncludesPublicHoliday(dateFrom, dateTo, (phRes.data || []).map(p => p.date?.slice(0, 10)))
  const overlapsWeekend = overlapsPlannedWeekend(plannerRes.data || [], dateFrom, dateTo)

  const { error } = await supabase.from('leave_requests').insert({
    profile_id: profileId,
    leave_type: leaveType,
    date_from: dateFrom,
    date_to: dateTo,
    notes: notes || null,
    includes_public_holiday: includesPublicHoliday,
    overlaps_rostered_weekend: overlapsWeekend,
  })
  if (error) throw new Error(error.message)
}
