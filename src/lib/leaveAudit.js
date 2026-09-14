// Pure aggregation for the admin Audit report (LeaveAuditReport.jsx) — an
// HR-audit view of cumulative leave per doctor over an admin-chosen date
// range, as opposed to the doctor-facing "My leave" tracker (leaveDashboard.js),
// which always resets to the current calendar year. Kept separate from the
// Supabase fetch so it's unit-testable without mocking the client.
import { LEAVE_TYPE_OPTIONS } from './leaveRequests'
import { annualDaysInRange, totalDaysInRange, pendingRequestCountInRange } from './leaveDashboard'

// One audit column per leave type, in the order the report draws them —
// annual first because it is the one with a real balance behind it, then the
// rest in the picklist's own order, then the running total.
//
// Maternity and paternity share a column: they are the same entitlement seen
// from either side and the EC spreadsheet the report mirrors has always
// counted them as one. Every other type gets a column of its own, including
// single day — which is NOT annual leave. It has never been deducted from an
// annual balance (annual_leave_days only exists on `annual` rows), so
// folding it into the annual figure would have reported days against a
// balance that never lost them.
//
// weekend_exception is the one type with no column: it swaps which weekend
// you work rather than reducing required hours, so it is not leave taken.
const MERGED = { maternity: 'maternity_paternity', paternity: 'maternity_paternity' }
const EXCLUDED = new Set(['weekend_exception'])

// Fourteen columns of numbers have to fit a header each, so the table gets a
// short form — the picklist's own label is too long to set a column width by
// ("Statutory / public holiday" is five times the width of the figure under
// it). The full label stays on the header's title for anything ambiguous.
const SHORT_LABEL = {
  annual: 'Annual',
  sick: 'Sick',
  family_responsibility: 'Family resp.',
  study: 'Study',
  special_leave: 'Special',
  prenatal: 'Prenatal',
  maternity_paternity: 'Mat / pat',
  workshop: 'Workshop',
  course: 'Course',
  conference: 'Conf.',
  time_off_in_lieu: 'Lieu',
  statutory_public: 'Statutory',
  injury_on_duty: 'IOD',
  single_day: 'Single day',
}

export const AUDIT_LEAVE_COLUMNS = (() => {
  const columns = []
  const seen = new Set()
  for (const { value, label } of LEAVE_TYPE_OPTIONS) {
    if (EXCLUDED.has(value)) continue
    const key = MERGED[value] ?? value
    if (seen.has(key)) continue
    seen.add(key)
    const full = key === 'maternity_paternity' ? 'Maternity / paternity' : label
    columns.push({
      key,
      label: full,
      short: SHORT_LABEL[key] ?? full,
      types: LEAVE_TYPE_OPTIONS.map(o => o.value).filter(v => (MERGED[v] ?? v) === key),
    })
  }
  return columns
})()

// One summary row per profile: approved-day totals per leave type (see
// AUDIT_LEAVE_COLUMNS) plus pending *request* counts, all scoped to
// [rangeFrom, rangeTo]. profiles is every
// leave-eligible doctor to include (even ones with zero leave in range, so
// they aren't silently missing from the audit); leaveRequests is every
// leave_requests row overlapping the range for those profiles. Sorted by
// surname for a stable, scannable list.
export function buildAuditRows(profiles, leaveRequests, rangeFrom, rangeTo) {
  const rowsByProfile = new Map(profiles.map(p => [p.id, []]))
  for (const lr of leaveRequests) {
    rowsByProfile.get(lr.profile_id)?.push(lr)
  }

  return profiles
    .map(profile => {
      const rows = rowsByProfile.get(profile.id) || []

      // Annual is counted off annual_leave_days, the column the balance is
      // actually deducted from; every other type has no such field, so it
      // counts calendar days in range. That difference is why the buckets
      // are built here rather than by one shared reducer.
      const byColumn = {}
      for (const column of AUDIT_LEAVE_COLUMNS) {
        const columnRows = rows.filter(r => column.types.includes(r.leave_type))
        const approvedRows = columnRows.filter(r => r.status === 'approved')
        byColumn[column.key] = {
          approved: column.key === 'annual'
            ? annualDaysInRange(approvedRows, rangeFrom, rangeTo)
            : totalDaysInRange(approvedRows, rangeFrom, rangeTo),
          pending: pendingRequestCountInRange(columnRows, rangeFrom, rangeTo),
        }
      }

      return {
        profileId: profile.id,
        name: profile.name,
        surname: profile.surname,
        category: profile.category,
        colorCode: profile.color_code ?? null,
        byColumn,
        totalApprovedDays: AUDIT_LEAVE_COLUMNS.reduce((sum, c) => sum + byColumn[c.key].approved, 0),
      }
    })
    .sort((a, b) => a.surname.localeCompare(b.surname))
}
