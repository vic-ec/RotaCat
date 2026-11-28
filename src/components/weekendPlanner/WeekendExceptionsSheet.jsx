import { ActionSheet } from '../ActionSheet'
import { formatWeekendRange } from '../../lib/weekendPlanner'
import { labelForLeaveCategory } from '../../lib/leaveYearGrid'
import { REVIEW_STATUS_LABELS } from '../../lib/statusLabels'
import { fullDoctorName } from '../../lib/doctorNames'

// One weekend's exception requests, opened from that weekend's warning
// icon. A bottom sheet, as WeekendDetailSheet above, and the same row
// shape as the Annual/Special planners' day views (name, then category and
// period muted beside it, status right-aligned) so a request row reads
// identically wherever it appears.
export default function WeekendExceptionsSheet({ saturday, exceptions, displayNames, doctorById, onClose }) {
  return (
    <ActionSheet title={formatWeekendRange(saturday)} onClose={onClose}>
      <div className="px-3 pb-3 pt-1">
        <h2 className="font-display text-base font-bold text-ink">Weekend off requests</h2>
        <ul className="mt-3 divide-y divide-slate-line border-t border-slate-line">
          {exceptions.map(req => {
            const isPending = req.status === 'pending'
            return (
              <li key={req.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex-shrink-0 text-sm font-medium text-ink">
                    {fullDoctorName(doctorById.get(req.profile_id) ?? req.profiles, displayNames.get(req.profile_id) ?? '(unknown)')}
                  </span>
                  <span className="truncate text-xs text-ink-muted">
                    {labelForLeaveCategory(req.profiles?.category, req.profiles?.contract_type)}
                    {' · '}{formatWeekendRange(req.date_from)}
                  </span>
                </span>
                <span className={`flex-shrink-0 text-xs font-medium ${isPending ? 'text-flagAmber' : 'text-success'}`}>
                  {isPending ? REVIEW_STATUS_LABELS.pending : 'Approved'}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </ActionSheet>
  )
}
