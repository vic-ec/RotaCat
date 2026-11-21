import LeaveTypeIcon from './LeaveTypeIcon'
import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary, naturalLeavePeriodLabel } from '../lib/leaveRequests'
import { formatTimestampDate } from '../lib/dateRange'
import { reviewStatusLabel } from '../lib/statusLabels'
import { todayStr } from '../lib/dateRange'
import { cancelEligibility } from '../lib/leaveCancellation'
import CancelLeaveModal from './CancelLeaveModal'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
// Approved and Pending take the theme chips (SPEC app-theme); Rejected keeps
// the roster-state red.
const STATUS_BADGE = {
  pending: 'chip-amber',
  approved: 'chip-mint',
  rejected: 'bg-flagRed-bg text-flagRed',
  cancelled: 'bg-canvas-sunken text-ink-muted',
}

// Full personal request history (any type, any status) — the non-admin
// view for the "Requests" tab nested under Planners. Distinct from the
// Leave dashboard's "Upcoming" list (future-only, capped short): this is
// the complete record, including past and rejected requests, explicitly
// scoped to the signed-in doctor's own profile_id. onBack/backLabel mirror
// LeaveApprovalQueue's own — LeavePlannerPage.jsx wires both the same way,
// only when the visitor arrived via a planner's "View requests" link.
export default function MyRequestHistory({ onBack, backLabel = 'Planners' }) {
  const { profile, isAdmin } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; profile.id doesn't change within a session

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, reviewer:profiles!leave_requests_reviewed_by_fkey(name, surname), canceller:profiles!leave_requests_cancelled_by_fkey(name, surname), submitter:profiles!leave_requests_submitted_by_fkey(name, surname)')
      .eq('profile_id', profile.id)
      .order('date_from', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setLoading(false)
  }

  const backLink = onBack && (
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink">
      <ChevronLeft className="h-4 w-4" /> {backLabel}
    </button>
  )

  if (loading) return <>{backLink}<p className="text-sm text-ink-muted">Loading…</p></>
  if (error) return <>{backLink}<p className="text-sm text-flagRed">{error}</p></>

  const pending = requests.filter(lr => lr.status === 'pending')
  const approved = requests.filter(lr => lr.status === 'approved')
  const rejected = requests.filter(lr => lr.status === 'rejected')
  const cancelled = requests.filter(lr => lr.status === 'cancelled')

  // A doctor may cancel their own future leave (pending or approved); an
  // admin viewing their own history gets the admin rule (any time). The
  // database function re-checks all of this — see leaveCancellation.js.
  const today = todayStr()
  const canCancel = lr => cancelEligibility(lr, { isAdmin, viewerId: profile.id, todayStr: today }).allowed

  return (
    <div className="space-y-6">
      {backLink}
      <RequestSection title="Pending review" requests={pending} emptyLabel="No requests pending review" canCancel={canCancel} onCancel={setCancelTarget} />
      <RequestSection title="Approved" requests={approved} emptyLabel="No requests approved" canCancel={canCancel} onCancel={setCancelTarget} />
      {/* Only when there are any — a declined request still has to be
          findable somewhere, and this is the complete-record view, but an
          empty "Rejected" row on every doctor's page would be noise. */}
      {rejected.length > 0 && <RequestSection title="Rejected" requests={rejected} emptyLabel="" />}
      {cancelled.length > 0 && <RequestSection title="Cancelled" requests={cancelled} emptyLabel="" />}

      {cancelTarget && (
        <CancelLeaveModal
          request={cancelTarget}
          isOwn
          onClose={() => setCancelTarget(null)}
          onCancelled={() => { setCancelTarget(null); load() }}
        />
      )}
    </div>
  )
}

// Heading on the plain page background, rows in their own panel beneath —
// the same treatment the Dashboard's shift section uses. With nothing in
// the section the panel collapses to a single muted row instead of an
// empty bordered card.
function RequestSection({ title, requests, emptyLabel, canCancel, onCancel }) {
  return (
    <section aria-label={title}>
      {/* Divider role (SPEC app-theme): a sheen bar with the count. */}
      <h2 className="sheen-divider mb-3">
        <span>{title} <span className="divider-meta ml-1 font-normal">· {requests.length}</span></span>
      </h2>
      {requests.length === 0 ? (
        <p className="card px-4 py-3 text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <div className="card divide-y divide-slate-line overflow-hidden">
          {requests.map(lr => <RequestRow key={lr.id} request={lr} onCancel={canCancel?.(lr) ? onCancel : null} />)}
        </div>
      )}
    </section>
  )
}

function decisionLine(lr) {
  if (lr.status === 'cancelled') {
    const who = lr.cancelled_by === lr.profile_id ? 'you' : (lr.canceller ? `${lr.canceller.name} ${lr.canceller.surname}` : 'an admin')
    return `Cancelled by ${who} on ${formatTimestampDate(lr.cancelled_at)}${lr.cancel_reason ? ` — "${lr.cancel_reason}"` : ''}`
  }
  if (lr.status === 'pending' || !lr.reviewed_at) return null
  if (lr.status === 'approved' && lr.submitted_by && lr.submitted_by !== lr.profile_id) {
    return `Captured on your behalf by ${lr.submitter ? `${lr.submitter.name} ${lr.submitter.surname}` : 'an admin'} on ${formatTimestampDate(lr.reviewed_at)}`
  }
  return `${lr.status === 'approved' ? 'Approved' : 'Rejected'} by ${lr.reviewer ? `${lr.reviewer.name} ${lr.reviewer.surname}` : 'an admin'} on ${formatTimestampDate(lr.reviewed_at)}${lr.admin_notes ? ` — "${lr.admin_notes}"` : ''}`
}

function RequestRow({ request: lr, onCancel }) {
  const line = decisionLine(lr)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div>
        {/* naturalLeavePeriodLabel, not the raw YYYY-MM-DD columns — the
            same leave-period wording Team leave rows and the approval
            queue's summary already use, and it keeps the year visible,
            which this history (unlike the upcoming-only lists) spans. */}
        <p className="flex items-center gap-2 text-ink"><LeaveTypeIcon leaveType={lr.leave_type} size="sm" />{LEAVE_TYPE_LABELS[lr.leave_type]} — {naturalLeavePeriodLabel(lr.date_from, lr.date_to)}</p>
        {annualDaysSummary(lr) && <p className="text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
        {line && <p className="text-xs text-ink-muted">{line}</p>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={() => onCancel(lr)}
            className="text-xs font-medium text-danger underline-offset-2 hover:underline"
            aria-label={`Cancel ${LEAVE_TYPE_LABELS[lr.leave_type]} request`}
          >
            Cancel
          </button>
        )}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
          {reviewStatusLabel(lr.status)}
        </span>
      </div>
    </div>
  )
}
