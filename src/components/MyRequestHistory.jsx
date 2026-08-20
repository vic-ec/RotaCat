import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary, naturalLeavePeriodLabel } from '../lib/leaveRequests'
import { formatTimestampDate } from '../lib/dateRange'
import { reviewStatusLabel } from '../lib/statusLabels'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

// Full personal request history (any type, any status) — the non-admin
// view for the "Requests" tab nested under Planners. Distinct from the
// Leave dashboard's "Upcoming" list (future-only, capped short): this is
// the complete record, including past and rejected requests, explicitly
// scoped to the signed-in doctor's own profile_id.
export default function MyRequestHistory() {
  const { profile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- load is redefined every render; profile.id doesn't change within a session

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, reviewer:profiles!leave_requests_reviewed_by_fkey(name, surname)')
      .eq('profile_id', profile.id)
      .order('date_from', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setLoading(false)
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <p className="text-sm text-flagRed">{error}</p>

  const pending = requests.filter(lr => lr.status === 'pending')
  const approved = requests.filter(lr => lr.status === 'approved')
  const rejected = requests.filter(lr => lr.status === 'rejected')

  return (
    <div className="space-y-6">
      <RequestSection title="Pending review" requests={pending} emptyLabel="No requests pending review" />
      <RequestSection title="Approved" requests={approved} emptyLabel="No requests approved" />
      {/* Only when there are any — a declined request still has to be
          findable somewhere, and this is the complete-record view, but an
          empty "Rejected" row on every doctor's page would be noise. */}
      {rejected.length > 0 && <RequestSection title="Rejected" requests={rejected} emptyLabel="" />}
    </div>
  )
}

// Heading on the plain page background, rows in their own panel beneath —
// the same treatment the Dashboard's shift section uses. With nothing in
// the section the panel collapses to a single muted row instead of an
// empty bordered card.
function RequestSection({ title, requests, emptyLabel }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {requests.length === 0 ? (
        <p className="rounded-lg border border-slate-line bg-canvas-raised px-4 py-3 text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <div className="card divide-y divide-slate-line overflow-hidden">
          {requests.map(lr => <RequestRow key={lr.id} request={lr} />)}
        </div>
      )}
    </section>
  )
}

function RequestRow({ request: lr }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div>
        {/* naturalLeavePeriodLabel, not the raw YYYY-MM-DD columns — the
            same leave-period wording Team leave rows and the approval
            queue's summary already use, and it keeps the year visible,
            which this history (unlike the upcoming-only lists) spans. */}
        <p className="text-ink">{LEAVE_TYPE_LABELS[lr.leave_type]} — {naturalLeavePeriodLabel(lr.date_from, lr.date_to)}</p>
        {annualDaysSummary(lr) && <p className="text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
        {lr.status !== 'pending' && lr.reviewed_at && (
          <p className="text-xs text-ink-muted">
            {lr.status === 'approved' ? 'Approved' : 'Rejected'} by {lr.reviewer ? `${lr.reviewer.name} ${lr.reviewer.surname}` : 'an admin'} on {formatTimestampDate(lr.reviewed_at)}
            {lr.admin_notes && ` — "${lr.admin_notes}"`}
          </p>
        )}
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
        {reviewStatusLabel(lr.status)}
      </span>
    </div>
  )
}
