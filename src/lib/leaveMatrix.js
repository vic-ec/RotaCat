import { datesInRange } from './dateRange'
import { LEAVE_TYPE_OPTIONS } from './leaveRequests'

// Backs LeaveMatrix.jsx the way internRotations.js backs the intern matrix —
// all the layout maths, colour mapping and row bucketing live here as pure,
// unit-tested functions so the component stays a thin renderer.

export const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

// The 13 leave types collapse to 6 colour families — a legend short enough
// to scan (like the intern matrix's 5 rotation states) while the exact type
// still shows on the block's tooltip and in the detail panel. Ordered as the
// legend renders them.
export const LEAVE_GROUP_OPTIONS = [
  { key: 'annual', label: 'Annual' },
  { key: 'sick', label: 'Sick' },
  { key: 'family', label: 'Family / Special' },
  { key: 'study', label: 'Study / Training' },
  { key: 'parental', label: 'Parental' },
  { key: 'weekend', label: 'Weekend / Other' },
]

const LEAVE_TYPE_TO_GROUP = {
  annual: 'annual', single_day: 'annual',
  sick: 'sick',
  family_responsibility: 'family', special_leave: 'family',
  study: 'study', workshop: 'study', course: 'study', conference: 'study',
  prenatal: 'parental', maternity: 'parental', paternity: 'parental',
  weekend_exception: 'weekend',
}

// Standalone hex per family, NOT the reserved flag*/success Tailwind tokens —
// same rationale as ROTATION_TYPE_COLOR in staffDefaults.js: a leave *type*
// is a category, not a good/bad roster *state*, so it stays out of the
// semantic-token system and is applied via inline style.
export const LEAVE_GROUP_COLOR = {
  annual: '#2563EB', // blue
  sick: '#DC2626', // red
  family: '#D97706', // amber
  study: '#7C3AED', // violet
  parental: '#DB2777', // pink
  weekend: '#64748B', // slate
}

// Unknown/legacy types fall into the catch-all "Weekend / Other" family
// rather than throwing or rendering colourless.
export function leaveTypeGroupKey(leaveType) {
  return LEAVE_TYPE_TO_GROUP[leaveType] || 'weekend'
}

// "DD-MM-YYYY" from a YYYY-MM-DD date string (moved here from LeaveListView
// so both views share it).
export function formatDMY(dateStr) {
  return dateStr ? dateStr.split('-').reverse().join('-') : '—'
}

// "DD-MM-YYYY at HH:MM" from a full timestamp — same template as the
// pending-registration review page's "Registered X at Y" line.
export function formatDateTime(isoStr) {
  if (!isoStr) return null
  return `${isoStr.slice(0, 10).split('-').reverse().join('-')} at ${isoStr.slice(11, 16)}`
}

export function totalCalendarDays(lr) {
  return datesInRange(lr.date_from, lr.date_to).length
}

// The days that actually count against the leave balance — for annual leave
// that's the requester-entered annual_leave_days; every other type has no
// such distinction, so its full calendar-day span is what's taken.
export function totalLeaveDays(lr) {
  if (lr.leave_type === 'annual' && lr.annual_leave_days != null) return lr.annual_leave_days
  return totalCalendarDays(lr)
}

function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

// px offset of the START of `dateStr`'s day within a 12-month track built
// from fixed-width month columns. Per-month fractional positioning (rather
// than a flat day-of-year scale) keeps a bar sitting under the correct month
// column header even though months differ in length.
function dayOffsetPx(dateStr, monthColWidth) {
  const year = Number(dateStr.slice(0, 4))
  const monthIndex = Number(dateStr.slice(5, 7)) - 1
  const day = Number(dateStr.slice(8, 10))
  const dim = daysInMonth(year, monthIndex)
  return monthIndex * monthColWidth + ((day - 1) / dim) * monthColWidth
}

// Single-day / very short leave would otherwise render as a sub-pixel sliver;
// clamp so it stays clickable and visible.
export const MIN_BLOCK_WIDTH = 6

// { left, width } in px for a leave block within `year`'s 12-month track, or
// null if the [date_from, date_to] range doesn't intersect the year at all.
// The end edge fills the final day's own cell so an inclusive end day reads
// as covered.
export function blockPixelSpan(dateFrom, dateTo, year, monthColWidth) {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  if (dateTo < yearStart || dateFrom > yearEnd) return null
  const start = dateFrom < yearStart ? yearStart : dateFrom
  const end = dateTo > yearEnd ? yearEnd : dateTo
  const left = dayOffsetPx(start, monthColWidth)
  const endMonthIndex = Number(end.slice(5, 7)) - 1
  const endDim = daysInMonth(year, endMonthIndex)
  const right = dayOffsetPx(end, monthColWidth) + monthColWidth / endDim
  return { left, width: Math.max(MIN_BLOCK_WIDTH, right - left) }
}

// A minimal doctor object assembled from a request row's `profiles` join —
// carries everything ProfileAvatar / DoctorChip / category grouping need,
// so the matrix never has to fetch the profiles table separately.
export function doctorFromRequest(lr) {
  return {
    id: lr.profile_id,
    name: lr.profiles?.name || '',
    surname: lr.profiles?.surname || '',
    category: lr.profiles?.category || null,
    contract_type: lr.profiles?.contract_type || null,
    color_code: lr.profiles?.color_code || null,
    avatar_url: lr.profiles?.avatar_url || null,
    pattern_type: lr.profiles?.pattern_type || null,
  }
}

function intersectsYear(lr, year) {
  return lr.date_from <= `${year}-12-31` && lr.date_to >= `${year}-01-01`
}

// Groups the flat request list into per-doctor rows for the viewed year, each
// split into an `approved` and a `pending` track. Rejected/withdrawn leave is
// dropped (not drawn as a bar), and a doctor with neither approved nor pending
// leave intersecting the year is omitted entirely — which is what makes
// "tracks only when non-empty" fall out for free. Sorted by surname.
export function buildDoctorLeaveRows(requests, year) {
  const byDoctor = new Map()
  for (const lr of requests) {
    if (lr.status !== 'approved' && lr.status !== 'pending') continue
    if (!lr.profile_id) continue
    if (!intersectsYear(lr, year)) continue
    if (!byDoctor.has(lr.profile_id)) {
      byDoctor.set(lr.profile_id, { doctor: doctorFromRequest(lr), approved: [], pending: [] })
    }
    byDoctor.get(lr.profile_id)[lr.status].push(lr)
  }
  const rows = [...byDoctor.values()]
  for (const r of rows) {
    r.approved.sort((a, b) => a.date_from.localeCompare(b.date_from))
    r.pending.sort((a, b) => a.date_from.localeCompare(b.date_from))
  }
  rows.sort((a, b) =>
    (a.doctor.surname || '').localeCompare(b.doctor.surname || '') ||
    (a.doctor.name || '').localeCompare(b.doctor.name || ''))
  return rows
}

// "Who is on leave right now" — doctors whose APPROVED leave covers `isoDate`,
// grouped by colour family, one chip per doctor per family. Resolved off
// today independent of whichever year the grid is showing (mirrors the intern
// matrix's current-month panel).
export function leaveActiveOn(requests, isoDate) {
  const byGroup = new Map()
  const seen = new Set()
  for (const lr of requests) {
    if (lr.status !== 'approved') continue
    if (!(lr.date_from <= isoDate && lr.date_to >= isoDate)) continue
    const key = leaveTypeGroupKey(lr.leave_type)
    const dedupKey = `${key}|${lr.profile_id}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(doctorFromRequest(lr))
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => (a.surname || '').localeCompare(b.surname || ''))
  }
  return byGroup
}
