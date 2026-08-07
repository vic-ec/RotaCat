import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarSearch, TriangleAlert, ListFilter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ProfileAvatar from './ProfileAvatar'
import Tag from './Tag'
import Toolbar from './Toolbar'
import SortDirectionToggle from './SortDirectionToggle'
import { ApprovalRow, SelectAllRow } from './ListRow'
import BulkActionBar from './BulkActionBar'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all')

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
      prev.size === displayedRequests.length ? new Set() : new Set(displayedRequests.map(r => r.id))
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

  const filteredRequests = requests.filter(r => {
    if (leaveTypeFilter !== 'all' && r.leave_type !== leaveTypeFilter) return false
    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase()
      const fullName = `${r.profiles?.surname || ''} ${r.profiles?.name || ''}`.toLowerCase()
      if (!fullName.includes(q)) return false
    }
    return true
  })
  const displayedRequests = sortDirection === 'asc' ? filteredRequests : [...filteredRequests].reverse()
  const filtersActive = Boolean(searchQuery) || leaveTypeFilter !== 'all'

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

      <div className="mb-2 flex justify-end">
        <SortDirectionToggle value={sortDirection} onChange={setSortDirection} />
      </div>
      <Toolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by surname or first name…"
        filterFacets={[{
          key: 'leaveType', icon: <ListFilter className="h-4 w-4" />, label: 'Filter',
          value: leaveTypeFilter, onChange: setLeaveTypeFilter,
          options: [{ value: 'all', label: 'All leave types' }, ...LEAVE_TYPE_OPTIONS],
          isActive: leaveTypeFilter !== 'all',
        }]}
        active={filtersActive}
        onClearAll={() => { setSearchQuery(''); setLeaveTypeFilter('all') }}
      />

      {displayedRequests.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="mb-3 text-sm text-ink-muted">No pending requests match these filters.</p>
          {filtersActive && (
            <button onClick={() => { setSearchQuery(''); setLeaveTypeFilter('all') }} className="btn-secondary">
              Clear filters
            </button>
          )}
        </div>
      ) : (
      <>
      <BulkActionBar
        count={selectedIds.size}
        disabled={bulkActioning}
        actions={[
          { label: 'Approve selected', onClick: bulkApprove },
          { label: 'Reject selected', onClick: bulkReject, tone: 'danger' },
        ]}
        onCancel={() => setSelectedIds(new Set())}
      />

      <div className="card mb-3 overflow-hidden">
        <SelectAllRow
          checked={selectedIds.size === displayedRequests.length}
          onToggleCheck={toggleSelectAll}
          selectLabel="Select all pending leave requests"
          active={selectedIds.size > 0}
        />
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
            <div key={request.id} className="card overflow-hidden">
              <ApprovalRow
                checked={selectedIds.has(request.id)}
                onToggleCheck={() => toggleSelected(request.id)}
                selectLabel={`Select ${request.profiles?.name || ''} ${request.profiles?.surname || ''}`.trim()}
                avatar={<ProfileAvatar profile={{ id: request.profile_id, ...request.profiles }} size={32} />}
                name={`${request.profiles?.name || ''} ${request.profiles?.surname || ''}`.trim()}
                tag={categoryLabel && <Tag variant="role">{categoryLabel}</Tag>}
                meta={`${LEAVE_TYPE_LABELS[request.leave_type]} - ${rangeLabel}`}
                onApprove={() => (warned && !confirming) ? setConfirmingApproveId(request.id) : approve(request)}
                onReject={() => setRejectingId(request.id)}
                approveLabel={approveLabel}
                approveDisabled={isActioning || w === undefined}
                rejectDisabled={isActioning}
                extraAction={{
                  label: 'View Calendar',
                  icon: <CalendarSearch className="h-5 w-5" />,
                  onClick: () => openInCalendar(request),
                }}
              >
                {(daysTotalLine || request.notes) && (
                  <p className="text-xs text-ink-muted">
                    {daysTotalLine}
                    {daysTotalLine && request.notes && ' — '}
                    {request.notes && <span className="italic text-ink-light">&quot;{request.notes}&quot;</span>}
                  </p>
                )}

                {w === undefined ? (
                  <p className="mt-2 text-xs text-ink-muted">Checking for conflicts…</p>
                ) : warned && (
                  <div className="mt-2 space-y-1 rounded border border-flagAmber bg-flagAmber-bg p-3">
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
                  <div className="mt-2 space-y-2">
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
                        className="btn-danger-outline"
                      >
                        {isActioning ? 'Rejecting…' : 'Confirm reject'}
                      </button>
                    </div>
                  </div>
                )}
              </ApprovalRow>
            </div>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}
