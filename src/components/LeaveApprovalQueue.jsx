import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleCheck, CircleX, CalendarSearch, TriangleAlert, CalendarArrowDown, CalendarArrowUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar from './ProfileAvatar'
import { getApprovalWarnings, approveLeaveRequest, rejectLeaveRequest } from '../lib/leaveApprovals'
import { LEAVE_TYPE_OPTIONS, approvalDaysTotalLine, formatRequestDateRange } from '../lib/leaveRequests'

const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPE_OPTIONS.map(o => [o.value, o.label]))

const CATEGORY_LABELS = {
  MO:         'Medical Officer',
  Registrar:  'Registrar',
  COSMO:      'COSMO',
  COSMOPsych: 'COSMO (Psych)',
  Intern:     'Intern',
  Consultant: 'Consultant',
  Locum:      'Locum',
}

function hasWarnings(w) {
  return Boolean(w) && (w.supervisionBreaches.length > 0 || w.balanceWarnings.length > 0 || Boolean(w.hourCeilingWarning))
}

// The admin approval inbox — every pending leave_requests row, of any leave
// type. onBack, when given, renders a small "return to where you opened
// this from" link above the queue (LeavePlannerPage.jsx wires this to the
// Annual planner's overview tab, since that's the only place this queue is
// currently linked from).
export default function LeaveApprovalQueue({ onBack }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [warningsById, setWarningsById] = useState({})
  const [publicHolidayDates, setPublicHolidayDates] = useState(new Set())
  const [confirmingApproveId, setConfirmingApproveId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [actioningId, setActioningId] = useState(null)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  // 'asc' = oldest first (the server's own default order), 'desc' = newest first.
  const [sortDirection, setSortDirection] = useState('asc')
  const [bulkActioning, setBulkActioning] = useState(false)

  useEffect(() => { loadQueue() }, [])

  async function loadQueue() {
    setLoading(true)
    setError('')
    const [queueRes, phRes] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('*, profiles!leave_requests_profile_id_fkey(name, surname, category, contract_type, avatar_url, color_code, pattern_type)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.from('public_holidays').select('date'),
    ])
    if (queueRes.error) { setError(queueRes.error.message); setLoading(false); return }
    const data = queueRes.data || []
    setRequests(data)
    setWarningsById({})
    setPublicHolidayDates(new Set((phRes.data || []).map(ph => ph.date)))
    setLoading(false)

    const warningEntries = await Promise.all(
      data.map(async r => [r.id, await getApprovalWarnings(r)])
    )
    setWarningsById(Object.fromEntries(warningEntries))
  }

  // "View Calendar" jumps to the Annual planner's month workspace for this
  // request's month, with that date's review modal pre-opened — only fully
  // meaningful for annual leave, since the Annual planner's data (and its
  // month workspace) is scoped to leave_type='annual'. For any other type,
  // land on the Special tab instead — it doesn't have a per-day modal yet
  // (see FUTURE_IDEAS.md), but it's still the right neighbourhood.
  function openInCalendar(request) {
    if (request.leave_type === 'annual') {
      const month = request.date_from.slice(0, 7)
      navigate(`/leave?tab=planners&sub=annual&month=${month}&highlight=${request.date_from}`)
    } else {
      navigate('/leave?tab=planners&sub=special')
    }
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

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds(prev =>
      prev.size === requests.length ? new Set() : new Set(requests.map(r => r.id))
    )
  }

  async function bulkApprove() {
    const targets = requests.filter(r => selectedIds.has(r.id))
    setBulkActioning(true)
    setSelectedIds(new Set())
    await Promise.all(targets.map(r => approveLeaveRequest(r, user.id).catch(err => setError(err.message))))
    await loadQueue()
    setBulkActioning(false)
  }

  async function bulkReject() {
    const targets = requests.filter(r => selectedIds.has(r.id))
    setBulkActioning(true)
    setSelectedIds(new Set())
    await Promise.all(targets.map(r => rejectLeaveRequest(r, user.id, '').catch(err => setError(err.message))))
    await loadQueue()
    setBulkActioning(false)
  }

  const displayedRequests = sortDirection === 'asc' ? requests : [...requests].reverse()

  const backLink = onBack && (
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-light hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Back to Annual planner
    </button>
  )

  if (loading) return <>{backLink}<p className="text-sm text-ink-muted">Loading pending requests…</p></>
  if (error) return <>{backLink}<p className="text-sm text-flagRed">{error}</p></>
  if (requests.length === 0) return <>{backLink}<p className="text-sm text-ink-muted">No pending leave requests.</p></>

  return (
    <div>
      {backLink}

      <div className="mb-3 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setSortDirection('asc')}
          title="Old to new"
          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
            sortDirection === 'asc'
              ? 'border-transparent bg-accent text-white'
              : 'border-slate-line text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
          }`}
        >
          <CalendarArrowDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSortDirection('desc')}
          title="New to old"
          className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
            sortDirection === 'desc'
              ? 'border-transparent bg-accent text-white'
              : 'border-slate-line text-ink-light hover:bg-canvas-sunken active:bg-canvas-sunken'
          }`}
        >
          <CalendarArrowUp className="h-4 w-4" />
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white">
          <span className="flex-1">{selectedIds.size} selected</span>
          <button
            onClick={bulkApprove}
            disabled={bulkActioning}
            className="rounded-md bg-success px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-85 active:opacity-85 disabled:opacity-50"
          >
            Approve selected
          </button>
          <button
            onClick={bulkReject}
            disabled={bulkActioning}
            className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-bold text-white/90 transition-colors hover:bg-white/10 active:bg-white/10 disabled:opacity-50"
          >
            Reject selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-medium text-white/60 hover:text-white/90"
          >
            Clear
          </button>
        </div>
      )}

      <div className="card mb-3 flex items-center gap-3 overflow-hidden px-5 py-2.5">
        <input
          type="checkbox"
          checked={selectedIds.size === requests.length}
          onChange={toggleSelectAll}
          aria-label="Select all pending leave requests"
          className="h-4 w-4 rounded border-slate-line accent-accent"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Select all</span>
      </div>

      <div className="space-y-3">
        {displayedRequests.map(request => {
          const w = warningsById[request.id]
          const warned = hasWarnings(w)
          const confirming = confirmingApproveId === request.id
          const isActioning = actioningId === request.id
          const { rangeLabel } = formatRequestDateRange(request.date_from, request.date_to, publicHolidayDates)
          const approveLabel = warned ? (confirming ? 'Confirm approval' : 'Approve anyway') : 'Approve'
          const categoryLabel = request.profiles?.category ? (CATEGORY_LABELS[request.profiles.category] || request.profiles.category) : null
          const daysTotalLine = approvalDaysTotalLine(request)

          return (
            <div key={request.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(request.id)}
                    onChange={() => toggleSelected(request.id)}
                    aria-label={`Select ${request.profiles?.name || ''} ${request.profiles?.surname || ''}`.trim()}
                    className="mt-1.5 h-4 w-4 flex-shrink-0 rounded border-slate-line accent-accent"
                  />
                  <ProfileAvatar profile={{ id: request.profile_id, ...request.profiles }} size={32} className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink">
                        {request.profiles?.name} {request.profiles?.surname}
                      </p>
                      {categoryLabel && (
                        <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-bold text-success">
                          {categoryLabel}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">{LEAVE_TYPE_LABELS[request.leave_type]} - {rangeLabel}</p>
                    {daysTotalLine && <p className="text-xs text-ink-muted">{daysTotalLine}</p>}
                    {request.notes && <p className="mt-1 text-xs italic text-ink-light">&quot;{request.notes}&quot;</p>}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => (warned && !confirming) ? setConfirmingApproveId(request.id) : approve(request)}
                    disabled={isActioning || w === undefined}
                    title={approveLabel}
                    aria-label={isActioning ? 'Approving…' : approveLabel}
                    className="flex h-8 w-8 items-center justify-center text-accent transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CircleCheck className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingId(request.id)}
                    disabled={isActioning}
                    title="Reject"
                    aria-label="Reject"
                    className="flex h-8 w-8 items-center justify-center text-flagRed transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CircleX className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openInCalendar(request)}
                    title="View Calendar"
                    aria-label="View Calendar"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-success/40 bg-success-bg text-success transition-colors hover:bg-success/25 active:border-accent active:bg-accent active:text-white"
                  >
                    <CalendarSearch className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {w === undefined ? (
                <p className="mt-2 text-xs text-ink-muted">Checking for conflicts…</p>
              ) : warned && (
                <div className="mt-3 space-y-1 rounded border border-flagAmber bg-flagAmber-bg p-3">
                  {w.supervisionBreaches.length > 0 && (
                    <p className="text-xs text-flagAmber">
                      <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                      Approving would drop supervision below the required minimum on {w.supervisionBreaches.length} shift{w.supervisionBreaches.length !== 1 ? 's' : ''}.
                    </p>
                  )}
                  {w.balanceWarnings.map(bw => (
                    <p key={bw.year} className="text-xs text-flagAmber">
                      <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                      {bw.year} annual leave balance would go negative ({bw.remainingAfter} of {bw.daysAllotted} days remaining).
                    </p>
                  ))}
                  {w.hourCeilingWarning && (
                    <p className="text-xs text-flagAmber">
                      <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                      Five-eighths doctor already has {w.hourCeilingWarning.alreadyRosteredHours}h rostered this month (ceiling: {w.hourCeilingWarning.maxHours}h).
                    </p>
                  )}
                </div>
              )}

              {rejectingId === request.id && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    placeholder="Reason (optional, visible to the doctor)…"
                    rows={2}
                    className="input-field w-full"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setRejectingId(null); setRejectNotes('') }} className="btn-secondary">Cancel</button>
                    <button
                      onClick={() => reject(request)}
                      disabled={isActioning}
                      className="rounded border border-flagRed px-4 py-1 text-sm font-medium text-flagRed transition-colors hover:bg-flagRed-bg active:bg-flagRed-bg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isActioning ? 'Rejecting…' : 'Confirm reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
