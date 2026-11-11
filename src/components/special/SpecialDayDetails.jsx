import { useAuth } from '../../context/AuthContext'
import { formatWeekdayDate, formatShortDateRange } from '../../lib/dateRange'
import { COLUMN_BADGE_LABEL, capacityStateForCount } from '../../lib/leaveYearGrid'
import { SPECIAL_LEAVE_SOFT_CAP, shortLeaveTypeLabel } from '../../lib/leaveRequests'
import { REVIEW_STATUS_LABELS } from '../../lib/statusLabels'
import CategoryBadge from '../CategoryBadge'

// The Special month view's SELECTED DAY content — the counterpart of
// annual/DayDetails, mounted by PlannerDetailsCard (rail card on a
// desktop, bottom sheet on a phone). It replaced the centred DayPanel
// modal. Read-only apart from the way to ask: approving special leave
// lives in Planners → Requests, and the 3-doctor figure is a guideline,
// not a cap, so the request action is always offered.
//
//   rows   the day's entries with columnKey/columnLabel resolved and the
//          Consultant column already hidden from a non-admin
//   count  distinct doctors on genuine special leave that day (the true
//          shared count, hidden Consultants included)
export default function SpecialDayDetails({ date, rows, count, phName, displayNames = new Map(), onRequestLeave }) {
  const { canSubmitLeave } = useAuth()
  const cap = SPECIAL_LEAVE_SOFT_CAP
  const state = capacityStateForCount(count)
  const statusLine = count === 0 ? `Free · 0 of ${cap} on special leave`
    : count < cap ? `${count} of ${cap} on special leave`
    : count === cap ? `At guideline · ${cap} of ${cap} on special leave`
    : `Over guideline · ${count} on special leave, guideline ${cap}`

  return (
    <div data-testid="special-day-details">
      <h3 className="font-display text-base font-semibold text-ink">{formatWeekdayDate(date)}</h3>
      {phName && <p className="mt-1 inline-block rounded bg-ink/5 px-2 py-0.5 text-sm font-medium text-ink-light">{phName}</p>}

      <div className={`mt-3 rounded-lg p-3 ring-1 ring-inset ${state.tint} ${state.ringDark}`}>
        <p className={`text-sm font-bold ${state.text}`}>{statusLine}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Guideline of {cap} doctors on special leave at once, any category. It is not a cap: requests still go through and an admin decides.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No one is on special leave today.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-line border-t border-slate-line">
          {rows.map(e => (
            <li key={`${e.profileId}-${e.leaveType}-${e.dateFrom}`} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <CategoryBadge label={COLUMN_BADGE_LABEL[e.columnKey]} size={18} />
                <span className="flex-shrink-0 font-medium text-ink">{displayNames.get(e.profileId) ?? e.surname}</span>
                <span className="truncate text-xs text-ink-muted">
                  {[e.columnLabel, e.leaveType ? shortLeaveTypeLabel(e.leaveType) : null, e.dateFrom && e.dateTo ? formatShortDateRange(e.dateFrom, e.dateTo) : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`flex-shrink-0 text-xs font-medium ${e.status === 'pending' ? 'text-flagAmber' : 'text-success'}`}>
                {e.status === 'pending' ? REVIEW_STATUS_LABELS.pending : 'Approved'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canSubmitLeave && (
        <button type="button" onClick={() => onRequestLeave(date)} className="btn-secondary mt-4 w-full text-sm">
          Request leave from this day
        </button>
      )}
    </div>
  )
}
