// Pure aggregation for the admin Audit report (LeaveAuditReport.jsx) — an
// HR-audit view of cumulative leave per doctor over an admin-chosen date
// range, as opposed to the doctor-facing "My leave" tracker (leaveDashboard.js),
// which always resets to the current calendar year. Kept separate from the
// Supabase fetch so it's unit-testable without mocking the client.
import { SPECIAL_LEAVE_TYPES } from './leaveRequests'
import { annualDaysInRange, totalDaysInRange, pendingRequestCountInRange } from './leaveDashboard'

// One summary row per profile: approved-day totals (annual / special / sick
// — the same three-bucket grouping the My leave tracker uses) plus pending
// *request* counts, all scoped to [rangeFrom, rangeTo]. profiles is every
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
      const annualRows = rows.filter(r => r.leave_type === 'annual')
      const specialRows = rows.filter(r => SPECIAL_LEAVE_TYPES.includes(r.leave_type))
      const sickRows = rows.filter(r => r.leave_type === 'sick')

      const annual = {
        approved: annualDaysInRange(annualRows.filter(r => r.status === 'approved'), rangeFrom, rangeTo),
        pending: pendingRequestCountInRange(annualRows, rangeFrom, rangeTo),
      }
      const special = {
        approved: totalDaysInRange(specialRows.filter(r => r.status === 'approved'), rangeFrom, rangeTo),
        pending: pendingRequestCountInRange(specialRows, rangeFrom, rangeTo),
      }
      const sick = {
        approved: totalDaysInRange(sickRows.filter(r => r.status === 'approved'), rangeFrom, rangeTo),
        pending: pendingRequestCountInRange(sickRows, rangeFrom, rangeTo),
      }

      return {
        profileId: profile.id,
        name: profile.name,
        surname: profile.surname,
        category: profile.category,
        annual,
        special,
        sick,
        totalApprovedDays: annual.approved + special.approved + sick.approved,
      }
    })
    .sort((a, b) => a.surname.localeCompare(b.surname))
}
