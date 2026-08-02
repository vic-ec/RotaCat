// Leave-request submission — pure validation helpers (unit-testable without
// Supabase) plus the async submission flow that wires them together.
import { supabase } from './supabase'
import { addDays, datesInRange, rangesOverlap, dayOfWeek, parseLocalDate } from './dateRange'
import { overlapsPlannedWeekend } from './weekendPlanner'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_GROUP_KEYS, LEAVE_FULL_TIME_CONSTRAINT_KEY, LEAVE_FULL_TIME_DEFAULT_MAX,
  columnForLeaveCategory, buildLeaveByDate, countByColumnPerDate, findLeaveCapacityBreach, findFullTimeAggregateBreach,
} from './leaveYearGrid'

// Mirrors the official leave-type picklist (screenshot from the employer's
// leave system) plus a few RotaCat-specific extras that don't come from
// that list: single_day (a generic day off) and weekend_exception (tied to
// the weekend planner's exception flow, with its own Sat/Sun validation
// below). Every value here must exist in the `leave_type` Postgres enum.
export const LEAVE_TYPE_OPTIONS = [
  { value: 'annual', label: 'Annual leave' },
  { value: 'sick', label: 'Sick leave' },
  { value: 'family_responsibility', label: 'Family responsibility leave' },
  { value: 'study', label: 'Study leave' },
  { value: 'special_leave', label: 'Special leave' },
  { value: 'prenatal', label: 'Prenatal leave' },
  { value: 'maternity', label: 'Maternity leave' },
  { value: 'paternity', label: 'Paternity leave' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'course', label: 'Course / CPD' },
  { value: 'conference', label: 'Conference' },
  { value: 'single_day', label: 'Single day' },
  { value: 'weekend_exception', label: 'Weekend exception' },
]

// Every leave type but annual, sick, and weekend_exception, grouped into one
// "special leave" bucket for the My leave tracker and the admin Audit
// report — matches how the reference leave-type picklist groups everything
// else together. weekend_exception is excluded: it's an exception to which
// specific weekend you work, not a reduction in required hours, so unlike
// genuine special leave it shouldn't count toward a "days off" tracker.
export const SPECIAL_LEAVE_TYPES = LEAVE_TYPE_OPTIONS
  .map(o => o.value)
  .filter(v => v !== 'annual' && v !== 'sick' && v !== 'weekend_exception')

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

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDDDddMMMYYYY(dateStr) {
  const d = parseLocalDate(dateStr)
  return `${WEEKDAY_ABBR[d.getDay()]} ${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`
}

// "Sat 15 Aug 2026 to Sun 30 Aug 2026" (just the one date, unrepeated, for a
// single-day request) plus a second summary line counting weekends,
// Saturdays, Sundays, and public holidays the range touches — detail a plain
// YYYY-MM-DD → YYYY-MM-DD range doesn't surface, e.g. "does approving this
// also grant a public holiday, or span two weekends unnecessarily." A
// "weekend" here means a Saturday in the range whose very next day (Sunday)
// is also in the range — a lone trailing/leading Saturday or Sunday still
// counts toward the Saturday/Sunday tallies but not the weekend one.
export function formatRequestDateRange(dateFrom, dateTo, publicHolidayDates = []) {
  const rangeLabel = dateFrom === dateTo
    ? formatDDDddMMMYYYY(dateFrom)
    : `${formatDDDddMMMYYYY(dateFrom)} to ${formatDDDddMMMYYYY(dateTo)}`

  const phSet = publicHolidayDates instanceof Set ? publicHolidayDates : new Set(publicHolidayDates)
  const dates = datesInRange(dateFrom, dateTo)
  const dateSet = new Set(dates)
  const satCount = dates.filter(d => dayOfWeek(d) === 6).length
  const sunCount = dates.filter(d => dayOfWeek(d) === 0).length
  const weekendCount = dates.filter(d => dayOfWeek(d) === 6 && dateSet.has(addDays(d, 1))).length
  const phCount = dates.filter(d => phSet.has(d)).length

  const parts = []
  if (weekendCount > 0) parts.push(`${weekendCount} weekend${weekendCount === 1 ? '' : 's'}`)
  if (satCount > 0) parts.push(`${satCount} Saturday${satCount === 1 ? '' : 's'}`)
  if (sunCount > 0) parts.push(`${sunCount} Sunday${sunCount === 1 ? '' : 's'}`)
  if (phCount > 0) parts.push(`${phCount} Public Holiday${phCount === 1 ? '' : 's'}`)
  const extraLine = parts.length ? `${parts.join(', ')} included` : null

  return { rangeLabel, extraLine }
}

// A short "N total (M annual)" qualifier for any leave_requests row where
// leave_type is 'annual' and annual_leave_days is present — distinguishing
// the total unavailable-for-rostering period from the days that actually
// count against the balance, for HR-audit visibility wherever a request is
// listed. Null for non-annual types or legacy rows with no
// annual_leave_days yet (nothing to contrast against).
export function annualDaysSummary({ leave_type: leaveType, date_from: dateFrom, date_to: dateTo, annual_leave_days: annualLeaveDays }) {
  if (leaveType !== 'annual' || annualLeaveDays == null) return null
  const totalDays = datesInRange(dateFrom, dateTo).length
  return `${totalDays} total day${totalDays === 1 ? '' : 's'} (${annualLeaveDays} annual leave)`
}

// Same underlying numbers as annualDaysSummary, worded for the approval
// queue's row layout ("N days total - (M as annual leave)") — kept as its
// own export rather than reusing annualDaysSummary's text so that page's
// existing wording (and its tests) aren't disturbed elsewhere.
export function approvalDaysTotalLine({ leave_type: leaveType, date_from: dateFrom, date_to: dateTo, annual_leave_days: annualLeaveDays }) {
  if (leaveType !== 'annual' || annualLeaveDays == null) return null
  const totalDays = datesInRange(dateFrom, dateTo).length
  return `${totalDays} day${totalDays === 1 ? '' : 's'} total - (${annualLeaveDays} as annual leave)`
}

// annual_leave_days is entered by the requester, not auto-derived from the
// date range -- the 5-day/10-day padding-weekend rules need human
// judgement about which days in [dateFrom, dateTo] actually count against
// the balance. All this validates is that it's a sane whole number no
// greater than the total days requested (the range can include days that
// don't count, e.g. a padding weekend, never more days than exist in it).
export function isValidAnnualLeaveDays(annualLeaveDays, totalDays) {
  return Number.isInteger(annualLeaveDays) && annualLeaveDays >= 1 && annualLeaveDays <= totalDays
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
// doctors from the same capacity column (MO / Registrar / EC COSMO+Intern /
// OT COSMO+Intern) can be on leave at once, and — for the three "full-time
// doctor" columns only (MO/Registrar/EC COSMO+Intern) — a combined cap
// across all three together (e.g. 1 MO + 1 Registrar + 1 EC COSMO/Intern is
// fine, but 2 MO + 1 Registrar + 1 EC COSMO/Intern is not, even though each
// individual column is still within its own limit). Checked against every
// other pending or approved annual-leave request (rejected/withdrawn never
// count, same as the double-booking check above). No-op for any other leave
// type, or for a category with no capacity column (Other).
async function checkAnnualLeaveCapacity({ profileId, dateFrom, dateTo }) {
  const [profileRes, constraintsRes, overlappingRes] = await Promise.all([
    supabase.from('profiles').select('category').eq('id', profileId).single(),
    supabase.from('constraints').select('key, value').in('key', [...LEAVE_CAPACITY_COLUMNS.map(c => c.constraintKey), LEAVE_FULL_TIME_CONSTRAINT_KEY]),
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

  if (LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)) {
    const maxTotal = maxByConstraintKey[LEAVE_FULL_TIME_CONSTRAINT_KEY] ?? LEAVE_FULL_TIME_DEFAULT_MAX
    const { hasBreach: fullTimeBreach, breachDates: fullTimeDates } = findFullTimeAggregateBreach({ dateFrom, dateTo, maxTotal, existingCountsByDate: countsByDate })
    if (fullTimeBreach) {
      throw new Error(`No more than ${maxTotal} full-time doctors (MO/Registrar/EC COSMO/Intern combined) may be on leave at once, and that's already reached on ${fullTimeDates[0]}. Adjust the dates and try again.`)
    }
  }
}

function todayStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Full submission flow: fetches what's needed to validate, blocks on
// Tier-1 conflicts, computes the two derived flags, and inserts the row.
// Throws with a user-facing message on any Tier-1 rejection.
export async function submitLeaveRequest({ profileId, isAdmin, leaveType, dateFrom, dateTo, annualLeaveDays, notes }) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    throw new Error('Please choose a valid date range.')
  }

  if (leaveType === 'weekend_exception' && !isValidWeekendExceptionRange(dateFrom, dateTo)) {
    throw new Error('A weekend exception must cover exactly one Saturday and the following Sunday.')
  }

  if (leaveType === 'annual') {
    const totalDays = datesInRange(dateFrom, dateTo).length
    if (!isValidAnnualLeaveDays(annualLeaveDays, totalDays)) {
      throw new Error(`Enter how many of the ${totalDays} requested day${totalDays === 1 ? '' : 's'} count as annual leave (1–${totalDays}).`)
    }
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
    annual_leave_days: leaveType === 'annual' ? annualLeaveDays : null,
    notes: notes || null,
    includes_public_holiday: includesPublicHoliday,
    overlaps_rostered_weekend: overlapsWeekend,
  })
  if (error) throw new Error(error.message)
}
