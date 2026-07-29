// Leave-request submission — pure validation helpers (unit-testable without
// Supabase) plus the async submission flow that wires them together.
import { supabase } from './supabase'
import { addDays, datesInRange, rangesOverlap, dayOfWeek, parseLocalDate } from './dateRange'
import { overlapsRosteredWeekend } from './weekendProjection'

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

export { overlapsRosteredWeekend as computeOverlapsRosteredWeekend }

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

  const [leaveRes, entriesRes, phRes, patternRes] = await Promise.all([
    supabase.from('leave_requests').select('date_from, date_to, status').eq('profile_id', profileId),
    supabase.from('roster_entries').select('date').eq('profile_id', profileId).gte('date', dateFrom).lte('date', dateTo),
    supabase.from('public_holidays').select('date').gte('date', dateFrom).lte('date', dateTo),
    supabase.from('weekend_patterns').select('last_worked_weekend, last_weekend_type, next_weekend_type').eq('profile_id', profileId).maybeSingle(),
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
  const overlapsWeekend = overlapsRosteredWeekend(patternRes.data, dateFrom, dateTo)

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
