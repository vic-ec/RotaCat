// Leave-request submission — pure validation helpers (unit-testable without
// Supabase) plus the async submission flow that wires them together.
import { supabase } from './supabase'
import { addDays, datesInRange, rangesOverlap, dayOfWeek, parseLocalDate, formatShortDateRange } from './dateRange'
import { overlapsPlannedWeekend, groupEntriesByWeekend, weekendCoverageSummary, weekendHealthState } from './weekendPlanner'
import {
  LEAVE_CAPACITY_COLUMNS, LEAVE_FULL_TIME_GROUP_KEYS, LEAVE_FULL_TIME_CONSTRAINT_KEY, LEAVE_FULL_TIME_DEFAULT_MAX,
  LEAVE_CAPACITY_STATES, buildLeaveByDate, countByColumnPerDate, findLeaveCapacityBreach, findFullTimeAggregateBreach,
} from './leaveYearGrid'
import { slotsForColumnOnDate } from './monthWorkspace'
import { resolveLeaveCapacityColumn, fetchInternRotationsForDoctorIds, groupRotationsByDoctorId } from './internRotations'

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

// The EC Leave Planner sheet's documented guideline — no more than 3
// doctors (any category) on special leave at the same time — see
// SpecialLeavePlanner.jsx and fetchSpecialLeavePressure below. A plain
// constant, not a `constraints` table row: unlike the Annual Leave caps,
// this hasn't run against real submissions yet, so it stays a flag/
// advisory only (see fetchSpecialLeavePressure) until it's proven out and
// deliberately hardened into an enforced, admin-configurable value.
export const SPECIAL_LEAVE_SOFT_CAP = 3

// weekend_exception must cover exactly one Saturday+Sunday pair.
export function isValidWeekendExceptionRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return false
  return dayOfWeek(dateFrom) === 6 // Saturday
    && dateTo === addDays(dateFrom, 1)
    && dayOfWeek(dateTo) === 0 // Sunday
}

// A deactivated doctor keeps their historical footprint intact everywhere
// (past roster/weekend entries still show their real name — an HR
// audit-trail requirement), but shouldn't be able to create NEW leave/
// weekend obligations for a period they're not expected to be working.
// The one exception: a doctor with a known, scheduled return date
// (scheduledActiveDate) can still request dates from that date onward —
// e.g. putting in weekend preferences ahead of a rotation that's about to
// start. No scheduled return date at all means submission stays blocked
// entirely. Comparing dateFrom alone is enough to guarantee the whole
// range clears the bar: submitLeaveRequest already rejects dateFrom > dateTo
// before this ever runs, so dateTo can never fall before scheduledActiveDate
// once dateFrom does.
export function isEligibleToSubmitForDateRange({ isActive, scheduledActiveDate, dateFrom }) {
  if (isActive) return true
  return Boolean(scheduledActiveDate) && dateFrom >= scheduledActiveDate
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

// Day-of-week + bare date, no month/year — the compact half of a same-month
// range below (e.g. "Sat 3" in "Sat 3 - Sun 11 Oct 2026").
function formatDDDdd(dateStr) {
  const d = parseLocalDate(dateStr)
  return `${WEEKDAY_ABBR[d.getDay()]} ${d.getDate()}`
}

// "Sat 15 Aug 2026" (just the one date, unrepeated, for a single-day
// request); "Sat 3 - Sun 11 Oct 2026" when both dates share a month and
// year (month/year stated once, at the end, not repeated on the first
// date); "Sat 29 Aug 2026 - Wed 2 Sep 2026" otherwise (a dash, not the
// word "to", between two fully-spelled-out dates) — plus a second summary
// line counting weekends, Saturdays, Sundays, and public holidays the
// range touches — detail a plain YYYY-MM-DD → YYYY-MM-DD range doesn't
// surface, e.g. "does approving this also grant a public holiday, or span
// two weekends unnecessarily." A "weekend" here means a Saturday in the
// range whose very next day (Sunday) is also in the range — a lone
// trailing/leading Saturday or Sunday still counts toward the
// Saturday/Sunday tallies but not the weekend one.
export function formatRequestDateRange(dateFrom, dateTo, publicHolidayDates = []) {
  let rangeLabel
  if (dateFrom === dateTo) {
    rangeLabel = formatDDDddMMMYYYY(dateFrom)
  } else {
    const from = parseLocalDate(dateFrom)
    const to = parseLocalDate(dateTo)
    const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()
    rangeLabel = sameMonth
      ? `${formatDDDdd(dateFrom)} - ${formatDDDddMMMYYYY(dateTo)}`
      : `${formatDDDddMMMYYYY(dateFrom)} - ${formatDDDddMMMYYYY(dateTo)}`
  }

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

const LEAVE_PERIOD_MONTH_FORMAT = { month: 'long' }
const LEAVE_PERIOD_WEEKDAY_FORMAT = { weekday: 'short' }

// "3–11 October 2026" (same month/year), "28 Oct – 3 Nov 2026" (crosses a
// month), "29 Dec 2026 – 2 Jan 2027" (crosses a year), or "Sat 3 Oct 2026"
// for a single day — the approval queue's review drawer leads with this
// sentence rather than a pair of decorative date boxes (see
// LeaveRequestSummary.jsx), which only earn their place back when the
// range itself crosses a month/year boundary.
export function naturalLeavePeriodLabel(dateFrom, dateTo) {
  const from = parseLocalDate(dateFrom)
  const to = parseLocalDate(dateTo)
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
  const sameYear = from.getFullYear() === to.getFullYear()

  if (dateFrom === dateTo) {
    return `${from.toLocaleDateString('en-GB', LEAVE_PERIOD_WEEKDAY_FORMAT)} ${from.getDate()} ${from.toLocaleDateString('en-GB', LEAVE_PERIOD_MONTH_FORMAT)} ${from.getFullYear()}`
  }
  if (sameMonth) {
    return `${from.getDate()}–${to.getDate()} ${from.toLocaleDateString('en-GB', LEAVE_PERIOD_MONTH_FORMAT)} ${from.getFullYear()}`
  }
  const fromMonthAbbr = from.toLocaleDateString('en-GB', { month: 'short' })
  const toMonthAbbr = to.toLocaleDateString('en-GB', { month: 'short' })
  if (sameYear) {
    return `${from.getDate()} ${fromMonthAbbr} – ${to.getDate()} ${toMonthAbbr} ${from.getFullYear()}`
  }
  return `${from.getDate()} ${fromMonthAbbr} ${from.getFullYear()} – ${to.getDate()} ${toMonthAbbr} ${to.getFullYear()}`
}

// Maps a { taken, max } annual-leave-slot reading onto one of 3 named
// tiers for the approval queue's Capacity Assessment card — "Available"
// (at most half the pool taken), "Limited" (more than half taken but room
// remains), "At capacity" (none left). Reuses the same LEAVE_CAPACITY_STATES
// tokens the year planner's day cells already use (indices 0/1/3 of the
// 4-tier scale — the "near_capacity" tier between them isn't surfaced
// here, this card only ever needs 3 named states), so the colors read the
// same wherever a leave-slot count appears in the app.
export function capacityAssessmentState({ taken, max }) {
  if (taken >= max) return LEAVE_CAPACITY_STATES[3] // at_capacity
  if (max > 0 && taken / max > 0.5) return LEAVE_CAPACITY_STATES[1] // limited
  return LEAVE_CAPACITY_STATES[0] // available
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
// OT COSMO+Intern) can be on leave at once, and — combined across MO,
// Registrar, and EC COSMO/Intern only — a shared cap of 2 "full-time EC
// doctors" at once (e.g. 1 MO + 1 Registrar is fine, but 1 MO + 1 Registrar
// + 1 EC COSMO/Intern is not, even though each individual column is still
// within its own limit). OT COSMO/Intern is a separate pool, capped
// independently and not part of this aggregate.
// Checked against every other pending or approved annual-leave request
// (rejected/withdrawn never count, same as the double-booking check above).
// No-op for any other leave type, or for a category with no capacity column
// (Other).
async function checkAnnualLeaveCapacity({ profileId, dateFrom, dateTo }) {
  const [profileRes, constraintsRes, overlappingRes] = await Promise.all([
    supabase.from('profiles').select('category, contract_type').eq('id', profileId).single(),
    supabase.from('constraints').select('key, value').in('key', [...LEAVE_CAPACITY_COLUMNS.map(c => c.constraintKey), LEAVE_FULL_TIME_CONSTRAINT_KEY]),
    supabase.from('leave_requests')
      .select('profile_id, date_from, date_to, profiles!leave_requests_profile_id_fkey(category, contract_type)')
      .eq('leave_type', 'annual')
      .in('status', ['pending', 'approved'])
      .neq('profile_id', profileId)
      .lte('date_from', dateTo)
      .gte('date_to', dateFrom),
  ])

  const overlappingRows = overlappingRes.data || []

  // An Intern's capacity pool is date-driven (see internRotations.js) --
  // resolve every doctor's own rotation blocks (the submitter's, plus
  // every OTHER doctor whose overlapping request needs correctly bucketing
  // by ITS OWN date_from, not the submitter's dates) before doing any
  // bucketing below. A rotation-fetch hiccup must never block submission
  // of an otherwise-valid request, so this degrades to an empty map (same
  // as "no rotation assigned yet") rather than throwing.
  let rotationsByDoctorId = new Map()
  try {
    const doctorIds = [profileId, ...overlappingRows.map(r => r.profile_id)]
    rotationsByDoctorId = groupRotationsByDoctorId(await fetchInternRotationsForDoctorIds(doctorIds))
  } catch {
    // fall through with an empty map -- resolveLeaveCapacityColumn already
    // degrades gracefully to static category bucketing for every doctor
  }

  const columnKey = resolveLeaveCapacityColumn({ category: profileRes.data?.category, contractType: profileRes.data?.contract_type, profileId, date: dateFrom, rotationsByDoctorId })
  const columnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnKey)
  if (!columnDef) return // this doctor's category has no capacity cap (Other column)

  const maxByConstraintKey = Object.fromEntries((constraintsRes.data || []).map(c => [c.key, Number(c.value)]))
  const maxConcurrent = maxByConstraintKey[columnDef.constraintKey] ?? columnDef.defaultMax

  const byDate = buildLeaveByDate(overlappingRows, {
    yearFrom: Number(dateFrom.slice(0, 4)), yearTo: Number(dateTo.slice(0, 4)),
  })
  const countsByDate = countByColumnPerDate(byDate, e => resolveLeaveCapacityColumn({
    category: e.profiles?.category, contractType: e.profiles?.contract_type, profileId: e.profile_id, date: e.date_from, rotationsByDoctorId,
  }))

  const { hasBreach, breachDates } = findLeaveCapacityBreach({ dateFrom, dateTo, columnKey, maxConcurrent, existingCountsByDate: countsByDate })
  if (hasBreach) {
    const plural = maxConcurrent === 1 ? 'doctor is' : 'doctors are'
    throw new Error(`Only ${maxConcurrent} ${columnDef.label} ${plural} allowed on leave at once, and that's already reached on ${breachDates[0]}. Adjust the dates and try again.`)
  }

  if (LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)) {
    const maxTotal = maxByConstraintKey[LEAVE_FULL_TIME_CONSTRAINT_KEY] ?? LEAVE_FULL_TIME_DEFAULT_MAX
    const { hasBreach: fullTimeBreach, breachDates: fullTimeDates } = findFullTimeAggregateBreach({ dateFrom, dateTo, maxTotal, existingCountsByDate: countsByDate })
    if (fullTimeBreach) {
      throw new Error(`No more than ${maxTotal} full-time EC doctors (MO/Registrar/EC COSMO/Intern combined) may be on leave at once, and that's already reached on ${fullTimeDates[0]}. Adjust the dates and try again.`)
    }
  }
}

// Pure per-date scan behind fetchAnnualCapacityPreview below — the single
// most-constrained date in [dateFrom, dateTo] for `columnKey`'s pool (the
// shared full-time pool for MO/Registrar/EC Intern, or the column's own
// count otherwise — see slotsForColumnOnDate in monthWorkspace.js, reused
// rather than reimplemented here). Ties go to the earliest date, matching
// findLeaveCapacityBreach/findFullTimeAggregateBreach's own
// earliest-first convention. Returns null only for an empty range (never
// happens in practice — callers already validate dateFrom <= dateTo).
// `pooled` tells LeaveCapacityBanner whether `taken`/`max` are this column's
// own count, or the shared full-time pool's (see LEAVE_FULL_TIME_POOL_LABEL)
// — without it, a pooled reading (e.g. a Registrar's own leave using up the
// EC Intern column's "slot") reads as that category's own quota being full.
export function findWorstAnnualCapacitySlot({ dateFrom, dateTo, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap }) {
  let worst = null
  for (const date of datesInRange(dateFrom, dateTo)) {
    const { taken, max } = slotsForColumnOnDate(date, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap)
    if (!worst || (max - taken) < (worst.max - worst.taken)) {
      worst = { date, taken, max }
    }
  }
  return worst ? { ...worst, atCapacity: worst.taken >= worst.max, pooled: LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey) } : null
}

// Read-only, non-blocking counterpart to checkAnnualLeaveCapacity above —
// same query shape (constraints + overlapping annual leave_requests for
// the date range), but scoped to a not-yet-submitted request's own picked
// range instead of a submit-time guard, and never throws. Used to drive
// LeaveRequestForm's live capacity preview via LeaveCapacityBanner, the
// same component MonthWorkspace's DayReviewModal renders. Unlike
// checkAnnualLeaveCapacity, `category`/`profileId` are passed directly (the
// caller already has the signed-in profile in hand) rather than looked up
// fresh, and the overlapping-requests query doesn't exclude anyone — this
// is a preview of room for a new request, not a conflict check against the
// requester's own other rows. `profileId` doubles as the resolution key
// for the requester's own rotation (an Intern's pool is date-driven — see
// internRotations.js) and is excluded from `rotationsByDoctorId`'s "other
// doctor" fetch when already covered by its own lookup. `columnKeyOverride`
// lets a caller preview a DIFFERENT column's room entirely, bypassing the
// category/contractType/rotation resolution below — used by
// LeaveRequestForm's "Checking capacity for" picker so a doctor (an Intern
// especially, whose real pool is date-driven) can look ahead at a category
// other than the one they'd actually resolve to today. This never changes
// what a submitted request is actually checked/counted against — that still
// always resolves fresh from the real profile at submission time.
export async function fetchAnnualCapacityPreview({ dateFrom, dateTo, category, contractType, profileId, columnKeyOverride }) {
  try {
    const [constraintsRes, overlappingRes] = await Promise.all([
      supabase.from('constraints').select('key, value').in('key', [...LEAVE_CAPACITY_COLUMNS.map(c => c.constraintKey), LEAVE_FULL_TIME_CONSTRAINT_KEY]),
      supabase.from('leave_requests')
        .select('profile_id, date_from, date_to, profiles!leave_requests_profile_id_fkey(category, contract_type)')
        .eq('leave_type', 'annual')
        .in('status', ['pending', 'approved'])
        .lte('date_from', dateTo)
        .gte('date_to', dateFrom),
    ])

    const overlappingRows = overlappingRes.data || []

    let rotationsByDoctorId = new Map()
    try {
      const doctorIds = [profileId, ...overlappingRows.map(r => r.profile_id)]
      rotationsByDoctorId = groupRotationsByDoctorId(await fetchInternRotationsForDoctorIds(doctorIds))
    } catch {
      // informational preview only -- a rotation-fetch hiccup just falls
      // back to static category bucketing below, same as checkAnnualLeaveCapacity
    }

    const columnKey = columnKeyOverride || resolveLeaveCapacityColumn({ category, contractType, profileId, date: dateFrom, rotationsByDoctorId })
    const columnDef = LEAVE_CAPACITY_COLUMNS.find(c => c.key === columnKey)
    if (!columnDef) return null // this category has no capacity cap (Other column) — nothing to preview

    const maxByConstraintKey = Object.fromEntries((constraintsRes.data || []).map(c => [c.key, Number(c.value)]))
    const maxByColumnKey = { [columnKey]: maxByConstraintKey[columnDef.constraintKey] ?? columnDef.defaultMax }
    const maxFullTime = maxByConstraintKey[LEAVE_FULL_TIME_CONSTRAINT_KEY] ?? LEAVE_FULL_TIME_DEFAULT_MAX

    const byDate = buildLeaveByDate(overlappingRows, {
      yearFrom: Number(dateFrom.slice(0, 4)), yearTo: Number(dateTo.slice(0, 4)),
    })
    const countByColumnPerDateMap = countByColumnPerDate(byDate, e => resolveLeaveCapacityColumn({
      category: e.profiles?.category, contractType: e.profiles?.contract_type, profileId: e.profile_id, date: e.date_from, rotationsByDoctorId,
    }))

    const worst = findWorstAnnualCapacitySlot({ dateFrom, dateTo, columnKey, maxByColumnKey, maxFullTime, countByColumnPerDateMap })
    return worst ? { ...worst, columnLabel: columnDef.label } : null
  } catch {
    return null // informative only — never let a fetch hiccup disrupt the form
  }
}

// Pure predicate behind fetchAffectedLeaveForRequest's pool-scoping filter
// below — whether a row resolving to `rowColumnKey` draws from the same
// leave-slot pool as a request resolving to `columnKey`. MO, Registrar, and
// EC Intern all share ONE combined pool (see LEAVE_FULL_TIME_GROUP_KEYS and
// findWorstAnnualCapacitySlot's own `pooled` flag above), so an exact
// column-key match under-counts: reviewing an EC Intern's request would
// otherwise miss a Registrar's overlapping leave even though the capacity
// gauge right above it is already counting that Registrar against the very
// same 2-slot pool. OT Intern stays its own independent pool (not part of
// the combined cap), so it still needs an exact match.
export function sameCapacityPool(columnKey, rowColumnKey) {
  if (LEAVE_FULL_TIME_GROUP_KEYS.includes(columnKey)) return LEAVE_FULL_TIME_GROUP_KEYS.includes(rowColumnKey)
  return rowColumnKey === columnKey
}

// Read-only "who else is already away" list for the approval queue's review
// drawer (AffectedLeaveList.jsx) — every OTHER pending/approved leave_requests
// row overlapping [dateFrom, dateTo], excluding the requester themselves.
// For an annual-leave request, narrowed further to rows resolving to the
// SAME capacity pool as this request (see sameCapacityPool above) — a
// static category/contract-type resolution, not the full intern-rotation-
// aware lookup fetchAnnualCapacityPreview uses — a deliberate
// simplification for this advisory list; it never gates approval, only
// informs it. Any other leave type has no shared-pool concept, so every
// overlapping row counts regardless of category. Never throws — a fetch
// hiccup just means an empty "who's away" list, same never-block contract
// as the other preview fetchers in this file.
export async function fetchAffectedLeaveForRequest({ dateFrom, dateTo, leaveType, category, contractType, profileId }) {
  try {
    const { data } = await supabase
      .from('leave_requests')
      .select('id, profile_id, date_from, date_to, status, leave_type, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type)')
      .in('status', ['pending', 'approved'])
      .neq('profile_id', profileId)
      .lte('date_from', dateTo)
      .gte('date_to', dateFrom)

    let rows = data || []
    if (leaveType === 'annual') {
      rows = rows.filter(r => r.leave_type === 'annual')
      const columnKey = resolveLeaveCapacityColumn({ category, contractType, profileId, date: dateFrom })
      if (columnKey) {
        rows = rows.filter(r => sameCapacityPool(columnKey, resolveLeaveCapacityColumn({
          category: r.profiles?.category, contractType: r.profiles?.contract_type, profileId: r.profile_id, date: r.date_from,
        })))
      }
    }

    return rows
      .map(r => ({
        id: r.id,
        profileId: r.profile_id,
        name: `${r.profiles?.name || ''} ${r.profiles?.surname || ''}`.trim() || 'Unknown',
        category: r.profiles?.category || null,
        status: r.status,
        dateFrom: r.date_from,
        dateTo: r.date_to,
      }))
      .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom))
  } catch {
    return []
  }
}

// Pure per-date scan behind fetchSpecialLeavePressure and
// SpecialLeavePlanner.jsx's own year-wide stat below — the date with the
// most DISTINCT doctors present in `byDate` (Map<date, entries[]>) within
// [dateFrom, dateTo]. A doctor with two overlapping special-leave rows on
// the same day only counts once. `profileIdOf` accounts for callers
// keying their entries differently: fetchSpecialLeavePressure's own raw
// leave_requests rows use `profile_id`, SpecialLeavePlanner's
// already-reshaped rows use `profileId`.
export function findWorstSpecialLeavePressure({ dateFrom, dateTo, byDate, profileIdOf = e => e.profile_id, softCap = SPECIAL_LEAVE_SOFT_CAP }) {
  let worst = null
  for (const date of datesInRange(dateFrom, dateTo)) {
    const count = new Set((byDate.get(date) || []).map(profileIdOf)).size
    if (!worst || count > worst.count) worst = { date, count }
  }
  return worst ? { ...worst, softCap, overSoftCap: worst.count >= softCap } : null
}

// Whole-year count of dates where DISTINCT doctors present in `byDate`
// meet or exceed `softCap` — the actual number behind the "no more than 3
// doctors..." guideline sentence, for SpecialLeavePlanner's year view.
// Shares `profileIdOf`/`softCap` semantics with findWorstSpecialLeavePressure
// above; the caller is responsible for `byDate` already containing only
// the entries that should count (e.g. SPECIAL_LEAVE_TYPES rows).
export function countSpecialLeavePressureDaysInYear({ year, byDate, profileIdOf = e => e.profile_id, softCap = SPECIAL_LEAVE_SOFT_CAP }) {
  return datesInRange(`${year}-01-01`, `${year}-12-31`).filter(date => {
    const count = new Set((byDate.get(date) || []).map(profileIdOf)).size
    return count >= softCap
  }).length
}

// Read-only, flag-only counterpart for special leave — there is no
// `checkSpecialLeaveCapacity` to mirror, since the ≤3-doctors guideline is
// deliberately not enforced yet (see SPECIAL_LEAVE_SOFT_CAP above). Never
// throws and is never called from submitLeaveRequest's blocking path —
// display/advisory only, wired into LeaveRequestForm and
// SpecialLeavePlanner.jsx.
export async function fetchSpecialLeavePressure({ dateFrom, dateTo }) {
  try {
    const { data } = await supabase
      .from('leave_requests')
      .select('profile_id, date_from, date_to')
      .in('leave_type', SPECIAL_LEAVE_TYPES)
      .in('status', ['pending', 'approved'])
      .lte('date_from', dateTo)
      .gte('date_to', dateFrom)

    const byDate = buildLeaveByDate(data || [], {
      yearFrom: Number(dateFrom.slice(0, 4)), yearTo: Number(dateTo.slice(0, 4)),
    })
    return findWorstSpecialLeavePressure({ dateFrom, dateTo, byDate })
  } catch {
    return null
  }
}

// Read-only, non-blocking counterpart for a weekend exception — how staffed
// the affected Saturday+Sunday already is, from the Weekend Planner's own
// weekend_planner_entries (see weekendCoverageSummary/weekendHealthState in
// weekendPlanner.js). Same never-throw contract as fetchAnnualCapacityPreview/
// fetchSpecialLeavePressure above: purely informative for
// LeaveRequestForm's advisory banner, never gates submitLeaveRequest (a
// weekend exception has no capacity check at all, unlike annual leave).
export async function fetchWeekendExceptionPreview({ saturday }) {
  try {
    const { data } = await supabase
      .from('weekend_planner_entries')
      .select('id, weekend_saturday, profile_id, category')
      .eq('weekend_saturday', saturday)

    const bySaturday = groupEntriesByWeekend(data || []).get(saturday)
    const { filledGroups, totalGroups } = weekendCoverageSummary(bySaturday)
    return { health: weekendHealthState(bySaturday), filledGroups, totalGroups }
  } catch {
    return null
  }
}

function todayStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Full submission flow: fetches what's needed to validate, blocks on
// Tier-1 conflicts, computes the two derived flags, and inserts the row.
// Throws with a user-facing message on any Tier-1 rejection.
export async function submitLeaveRequest({
  profileId, isAdmin, leaveType, dateFrom, dateTo, annualLeaveDays, notes, isActive, scheduledActiveDate,
}) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    throw new Error('Please choose a valid date range.')
  }

  if (!isEligibleToSubmitForDateRange({ isActive, scheduledActiveDate, dateFrom })) {
    throw new Error(scheduledActiveDate
      ? `You're marked inactive until ${formatShortDateRange(scheduledActiveDate, scheduledActiveDate)}. Choose a date on or after then.`
      : "You're marked inactive with no scheduled return date. Contact an admin to submit this request.")
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
