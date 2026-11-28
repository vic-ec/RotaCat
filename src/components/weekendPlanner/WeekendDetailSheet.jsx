import { CircleCheck, CircleAlert } from 'lucide-react'
import { ActionSheet } from '../ActionSheet'
import { CATEGORY_GROUPS, weekendCoverageSummary, formatWeekendRange } from '../../lib/weekendPlanner'
import { weekendBadge, myRequestLine } from './viewHelpers'
import AssignmentSummaryRow from './AssignmentSummaryRow'
import WeekendRequestsList from './WeekendRequestsList'

// Mobile-only read-only quick-glance for a weekend, opened by tapping a
// card's date header — the SELECTED WEEKEND bottom sheet (ActionSheet),
// never a centred popup, the same container PlannerDetailsCard gives the
// leave planners' day details below lg. This
// is deliberately NOT a replacement for the mobile card's own
// always-expanded, fully editable breakdown below it (which stays exactly
// as-is): that inline view already has everything, admin controls
// included, so a sheet re-showing the identical thing behind an extra tap
// would just be a redundant detour. This is a condensed alternative for a
// fast glance — status + assignments only, reusing WeekendInspector's own
// read-only AssignmentSummaryRow rather than rebuilding that breakdown a
// second time.
export default function WeekendDetailSheet({ saturday, weekendIndex, bySaturday, doctorById, displayNames, myRequest, myRequestName, exceptions = [], onClose }) {
  const coverage = weekendCoverageSummary(bySaturday)
  const needsPlanning = coverage.openGroups.length > 0
  const badge = weekendBadge(saturday, weekendIndex)

  return (
    <ActionSheet title="Selected weekend" onClose={onClose}>
      <div className="px-3 pb-3 pt-1">
        <h2 className="font-display text-base font-bold text-ink">{formatWeekendRange(saturday)}</h2>
        <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-line pt-3">
          <span className="text-sm text-ink-muted">Overall status</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            needsPlanning ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
          }`}>
            {needsPlanning ? <CircleAlert className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
            {needsPlanning
              ? `${coverage.openGroups.length} ${coverage.openGroups.length === 1 ? 'gap' : 'gaps'}`
              : `${coverage.filledGroups} of ${coverage.totalGroups} groups planned`}
          </span>
        </div>

        {myRequest && (
          <p className="mt-2 text-xs font-semibold text-ink-light">
            {myRequestLine(myRequest.status, myRequestName)}
          </p>
        )}

        <div className="mt-3 divide-y divide-slate-line">
          {CATEGORY_GROUPS.map(group => (
            <AssignmentSummaryRow key={group.key} group={group} groupEntries={bySaturday[group.key] || []} doctorById={doctorById} displayNames={displayNames} />
          ))}
        </div>
        <WeekendRequestsList exceptions={exceptions} displayNames={displayNames} doctorById={doctorById} />
      </div>
    </ActionSheet>
  )
}
