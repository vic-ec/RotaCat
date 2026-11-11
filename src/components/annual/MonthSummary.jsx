import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import CapacityBar from '../CapacityBar'
import { labelForLeaveCategory } from '../../lib/leaveYearGrid'
import { formatShortDateRange } from '../../lib/dateRange'
import { REVIEW_STATUS_LABELS } from '../../lib/statusLabels'

// The Annual overview's SELECTED MONTH card content: the stat row, the
// month's capacity bar, who is on leave, and the two ways on — mounted in
// PlannerDetailsCard. Pure display; everything is computed by the overview.
//
//   stats     { approved: { days, requests }, pending: { days, requests } }
//   buckets   daysBySlotsUsed's output for the month
//   totalDays days in the month; fullDays the count at the top level
//   entries   entriesInRange's output: { profileId, surname, category,
//             contractType, status, dateFrom, dateTo }
export default function MonthSummary({
  stats, buckets, totalDays, fullDays, entries, displayNames = new Map(), isAdmin, onOpenMonth, requestsHref,
}) {
  return (
    <div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-line pt-3">
        <Stat label="Approved" days={stats.approved.days} requests={stats.approved.requests} />
        <Stat label="Pending" days={stats.pending.days} requests={stats.pending.requests} />
      </div>

      <CapacityBar
        className="mt-3 border-t border-slate-line pt-3"
        buckets={buckets}
        heading={`Leave slots · ${totalDays} days`}
        aside={`${fullDays} ${fullDays === 1 ? 'day' : 'days'} full`}
      />

      <div className="mt-3 border-t border-slate-line pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">On leave</p>
        {entries.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">No leave this month.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {entries.map(e => (
              <li key={`${e.profileId}-${e.status}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
                  <span className="flex-shrink-0 text-xs text-ink-muted">{labelForLeaveCategory(e.category, e.contractType)}</span>
                </span>
                <span className="flex flex-shrink-0 items-baseline gap-1.5">
                  <span className="text-xs text-ink-muted">{formatShortDateRange(e.dateFrom, e.dateTo)}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    e.status === 'approved' ? 'bg-success-bg text-success' : 'bg-flagAmber-bg text-flagAmber'
                  }`}>
                    {e.status === 'approved' ? 'Approved' : REVIEW_STATUS_LABELS.pending}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Outlined, not filled: the panel's primary action is the one filled
          button on the page. */}
      <button type="button" onClick={onOpenMonth} className="btn-secondary mt-4 flex w-full items-center justify-center gap-1.5 text-sm">
        <ExternalLink className="h-3.5 w-3.5" /> Open month
      </button>
      <p className="mt-2 text-center text-xs">
        <Link to={requestsHref} className="font-medium text-accent underline-offset-2 hover:underline">
          {isAdmin ? 'Requests' : 'My requests'}
        </Link>
      </p>
    </div>
  )
}

function Stat({ label, days, requests }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-sm font-semibold text-ink">{days} {days === 1 ? 'day' : 'days'}</p>
      <p className="text-xs text-ink-light">{requests} {requests === 1 ? 'request' : 'requests'}</p>
    </div>
  )
}
