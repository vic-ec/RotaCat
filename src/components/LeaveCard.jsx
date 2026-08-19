import { ArrowRight } from 'lucide-react'
import Tag from './Tag'
import { leaveDateLabel, leaveDayCountLabel } from '../lib/leaveCard'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' }

// One leave request, one card — shared by the Dashboard's leave section and
// the "My leave" tab's Upcoming list, so a doctor sees the same object in
// both places rather than two different treatments of the same row.
//
// Deliberately NOT the LeaveDateRange chip pair used elsewhere (Team leave,
// the approval queue): two tinted date boxes carry weekday/weekend/public-
// holiday tone, which earns its place in a dense list of other people's
// leave but reads as decoration on a single personal record. Here the range
// is plain bold text with a quiet arrow, and the day counts sit underneath
// as small muted text. The other screens keep LeaveDateRange untouched.
export default function LeaveCard({ request, className = '' }) {
  const { leave_type: leaveType, date_from: dateFrom, date_to: dateTo, status } = request
  const singleDay = dateFrom === dateTo

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{LEAVE_TYPE_LABELS[leaveType] || 'Leave'}</h3>
        {status && (
          <Tag variant="status" tone={STATUS_TONE[status] || 'neutral'}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Tag>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
        <span>{leaveDateLabel(dateFrom)}</span>
        {!singleDay && (
          <>
            <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" aria-hidden="true" />
            <span>{leaveDateLabel(dateTo)}</span>
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{leaveDayCountLabel(request)}</p>
    </div>
  )
}
