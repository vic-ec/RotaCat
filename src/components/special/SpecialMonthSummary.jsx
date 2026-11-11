import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import CapacityBar from '../CapacityBar'
import { SPECIAL_LEAVE_SOFT_CAP, shortLeaveTypeLabel } from '../../lib/leaveRequests'
import { formatShortDateRange } from '../../lib/dateRange'
import { REVIEW_STATUS_LABELS } from '../../lib/statusLabels'
import { specialCapacityBarLabels } from '../../lib/specialPlanner'

// The Special overview's SELECTED MONTH card content — the counterpart of
// annual/MonthSummary, mounted in PlannerDetailsCard. Pure display.
//
//   stats      specialMonthStats' { approved, pending, pressureDays }
//   buckets    daysBySlotsUsed's output for the month, counting doctors on
//              special leave against the guideline
//   totalDays  days in the month
//   entries    specialMonthEntries' rows, one per request
export default function SpecialMonthSummary({
  stats, buckets, totalDays, entries, displayNames = new Map(), isAdmin, onOpenMonth, requestsHref,
}) {
  const atGuideline = stats.pressureDays
  return (
    <div>
      {/* Requests only, where the Annual card also counts days: special
          leave spans several types whose day counts aren't comparable
          (a half-day course beside a fortnight of maternity leave), and
          annual_leave_days is only recorded for annual leave.
          TODO: add a days line once leave_requests carries a per-type day
          count that can be summed here. */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-line pt-3">
        <Stat label="Approved" requests={stats.approved} />
        <Stat label="Pending" requests={stats.pending} />
      </div>

      {/* The guideline, not a cap: the last level is "at guideline" rather
          than "full", and the aside counts the days already at it. */}
      <CapacityBar
        className="mt-3 border-t border-slate-line pt-3"
        buckets={buckets}
        labels={specialCapacityBarLabels()}
        max={SPECIAL_LEAVE_SOFT_CAP}
        heading={`Special leave · ${totalDays} days`}
        aside={`${atGuideline} ${atGuideline === 1 ? 'day' : 'days'} at guideline`}
      />

      <div className="mt-3 border-t border-slate-line pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">On leave</p>
        {entries.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">No special leave booked or pending this month.</p>
        ) : (
          <ul data-testid="special-month-entries" className="mt-1 space-y-1">
            {entries.map(e => (
              <li key={`${e.profileId}-${e.leaveType}-${e.dateFrom}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
                  <span className="flex-shrink-0 text-xs text-ink-muted">{shortLeaveTypeLabel(e.leaveType)}</span>
                </span>
                <span className="flex flex-shrink-0 items-baseline gap-1.5">
                  <span className="text-xs text-ink-muted">{formatShortDateRange(e.dateFrom, e.dateTo)}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    e.status === 'pending' ? 'bg-flagAmber-bg text-flagAmber' : 'bg-success-bg text-success'
                  }`}>
                    {e.status === 'pending' ? REVIEW_STATUS_LABELS.pending : 'Approved'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Outlined: the panel's primary action is the one filled button. */}
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

function Stat({ label, requests }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-sm font-semibold text-ink">{requests} {requests === 1 ? 'request' : 'requests'}</p>
    </div>
  )
}
