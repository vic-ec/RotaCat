import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { LEAVE_TYPE_OPTIONS } from '../lib/leaveRequests'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

const STATUS_BADGE = {
  pending: 'bg-flagAmber-bg text-flagAmber',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-flagRed-bg text-flagRed',
}

// Team-wide leave list. Intentionally has NO role-conditional filtering —
// the leave_select RLS policy already scopes rows correctly per role
// (requester sees own always; other doctors see others' only once approved;
// clerk sees approved + today-only; locum sees nothing — enforced by this
// route being locum-blocked before this ever renders; admin sees all).
// This component just renders whatever comes back.
export default function LeaveListView() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, profiles(name, surname)')
      .order('date_from', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setLoading(false)
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>
  if (error) return <p className="text-sm text-flagRed">{error}</p>
  if (requests.length === 0) return <p className="text-sm text-ink-muted">No leave requests visible to you.</p>

  return (
    <div className="card divide-y divide-slate-line overflow-hidden">
      {requests.map(lr => (
        <div key={lr.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="font-medium text-ink">{lr.profiles?.name} {lr.profiles?.surname}</p>
            <p className="text-xs text-ink-muted">{LEAVE_TYPE_LABELS[lr.leave_type]} — {lr.date_from} → {lr.date_to}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lr.status]}`}>
            {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
          </span>
        </div>
      ))}
    </div>
  )
}
