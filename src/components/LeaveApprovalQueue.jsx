import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getApprovalWarnings, approveLeaveRequest, rejectLeaveRequest } from '../lib/leaveApprovals'
import { LEAVE_TYPE_OPTIONS, annualDaysSummary } from '../lib/leaveRequests'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

function hasWarnings(w) {
  return Boolean(w) && (w.supervisionBreaches.length > 0 || w.balanceWarnings.length > 0 || Boolean(w.hourCeilingWarning))
}

export default function LeaveApprovalQueue() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [warningsById, setWarningsById] = useState({})
  const [confirmingApproveId, setConfirmingApproveId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [actioningId, setActioningId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { loadQueue() }, [])

  async function loadQueue() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('leave_requests')
      .select('*, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRequests(data || [])
    setWarningsById({})
    setLoading(false)

    const warningEntries = await Promise.all(
      (data || []).map(async r => [r.id, await getApprovalWarnings(r)])
    )
    setWarningsById(Object.fromEntries(warningEntries))
  }

  async function approve(request) {
    setActioningId(request.id)
    try {
      await approveLeaveRequest(request, user.id)
    } catch (err) {
      setError(err.message)
      setActioningId(null)
      return
    }
    setConfirmingApproveId(null)
    setRequests(rs => rs.filter(r => r.id !== request.id))
    setActioningId(null)
  }

  async function reject(request) {
    setActioningId(request.id)
    try {
      await rejectLeaveRequest(request, user.id, rejectNotes)
    } catch (err) {
      setError(err.message)
      setActioningId(null)
      return
    }
    setRejectingId(null)
    setRejectNotes('')
    setRequests(rs => rs.filter(r => r.id !== request.id))
    setActioningId(null)
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading pending requests…</p>
  if (error) return <p className="text-sm text-flagRed">{error}</p>
  if (requests.length === 0) return <p className="text-sm text-ink-muted">No pending leave requests.</p>

  return (
    <div className="space-y-3">
      {requests.map(request => {
        const w = warningsById[request.id]
        const warned = hasWarnings(w)
        const confirming = confirmingApproveId === request.id
        const isActioning = actioningId === request.id

        return (
          <div key={request.id} className="card p-4">
            <p className="text-sm font-medium text-ink">
              {request.profiles?.name} {request.profiles?.surname}
              <span className="ml-2 text-xs font-normal text-ink-muted">{LEAVE_TYPE_LABELS[request.leave_type]}</span>
            </p>
            <p className="text-xs text-ink-muted">{request.date_from} → {request.date_to}</p>
            {annualDaysSummary(request) && <p className="text-xs text-ink-muted">{annualDaysSummary(request)}</p>}
            {request.notes && <p className="mt-1 text-xs italic text-ink-light">&quot;{request.notes}&quot;</p>}

            {w === undefined ? (
              <p className="mt-2 text-xs text-ink-muted">Checking for conflicts…</p>
            ) : warned && (
              <div className="mt-3 space-y-1 rounded border border-flagAmber bg-flagAmber-bg p-3">
                {w.supervisionBreaches.length > 0 && (
                  <p className="text-xs text-flagAmber">
                    ⚠ Approving would drop supervision below the required minimum on {w.supervisionBreaches.length} shift{w.supervisionBreaches.length !== 1 ? 's' : ''}.
                  </p>
                )}
                {w.balanceWarnings.map(bw => (
                  <p key={bw.year} className="text-xs text-flagAmber">
                    ⚠ {bw.year} annual leave balance would go negative ({bw.remainingAfter} of {bw.daysAllotted} days remaining).
                  </p>
                ))}
                {w.hourCeilingWarning && (
                  <p className="text-xs text-flagAmber">
                    ⚠ Five-eighths doctor already has {w.hourCeilingWarning.alreadyRosteredHours}h rostered this month (ceiling: {w.hourCeilingWarning.maxHours}h).
                  </p>
                )}
              </div>
            )}

            {rejectingId === request.id ? (
              <div className="mt-3 space-y-2">
                <textarea
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  placeholder="Reason (optional, visible to the doctor)…"
                  rows={2}
                  className="input-field w-full"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => reject(request)}
                    disabled={isActioning}
                    className="rounded border border-flagRed px-4 py-1 text-sm font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isActioning ? 'Rejecting…' : 'Confirm reject'}
                  </button>
                  <button onClick={() => { setRejectingId(null); setRejectNotes('') }} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => (warned && !confirming) ? setConfirmingApproveId(request.id) : approve(request)}
                  disabled={isActioning || w === undefined}
                  className="btn-primary"
                >
                  {isActioning ? 'Approving…' : warned ? (confirming ? 'Confirm approval' : 'Approve anyway') : 'Approve'}
                </button>
                <button onClick={() => setRejectingId(request.id)} disabled={isActioning} className="btn-secondary">
                  Reject
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
