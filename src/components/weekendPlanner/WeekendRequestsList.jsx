import { labelForLeaveCategory } from '../../lib/leaveYearGrid'
import { REVIEW_STATUS_LABELS } from '../../lib/statusLabels'
import { fullDoctorName } from '../../lib/doctorNames'

// One weekend's weekend-off requests, listed inside the SELECTED WEEKEND
// card under its status (and in the phone's quick-glance sheet) — the same
// row shape as the Annual/Special planners' day views: name, then category
// muted beside it, status right-aligned. Omitted entirely when the weekend
// has none. These are NOT special leave and carry no leave-capacity weight;
// they are an exception to WHICH weekend a doctor works, still approved via
// Planners -> Requests.
// The name comes from the planner's own doctor list (doctorById) so it
// reads the same here as on the cards; the request's joined row is only
// a fallback.
export default function WeekendRequestsList({ exceptions, displayNames, doctorById = new Map() }) {
  if (exceptions.length === 0) return null
  return (
    <div data-testid="weekend-requests" className="mt-3 border-t border-slate-line pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Weekend off requests</p>
      <ul className="mt-1 divide-y divide-slate-line">
        {exceptions.map(req => {
          const isPending = req.status === 'pending'
          return (
            <li key={req.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex-shrink-0 font-medium text-ink">
                  {fullDoctorName(doctorById.get(req.profile_id) ?? req.profiles, displayNames.get(req.profile_id) ?? '(unknown)')}
                </span>
                <span className="truncate text-xs text-ink-muted">
                  {labelForLeaveCategory(req.profiles?.category, req.profiles?.contract_type)}
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
  )
}
