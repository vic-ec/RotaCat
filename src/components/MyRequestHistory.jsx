import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary } from '../lib/leaveRequests'

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
  if (requests.length === 0) return <p className="text-sm text-ink-muted">No leave requests on record.</p>

  return (
    <div className="card divide-y divide-slate-line overflow-hidden">
      {requests.map(lr => (
        <div key={lr.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="text-ink">{LEAVE_TYPE_LABELS[lr.leave_type]} — {lr.date_from} → {lr.date_to}</p>
            {annualDaysSummary(lr) && <p className="text-xs text-ink-muted">{annualDaysSummary(lr)}</p>}
            {lr.status !== 'pending' && lr.reviewed_at && (
              <p className="text-xs text-ink-muted">
                {lr.status === 'approved' ? 'Approved' : 'Rejected'} by {lr.reviewer ? `${lr.reviewer.name} ${lr.reviewer.surname}` : 'an admin'} on {new Date(lr.reviewed_at).toLocaleDateString()}
                {lr.admin_notes && ` — "${lr.admin_notes}"`}
              </p>
            )}
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
            {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
          </span>
        </div>
      ))}
    </div>
  )
}
